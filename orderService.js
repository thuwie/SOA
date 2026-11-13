const express = require('express');
const app = express();

const PORT = 3002; // Cổng riêng cho Order Service (SOA)
const AUTH_SERVICE_URL = 'http://localhost:3000/auth';
const PRODUCT_SERVICE_URL = 'http://localhost:3001/products';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// GIẢ LẬP CƠ SỞ DỮ LIỆU (BẢNG ORDERS & ORDER_ITEMS)
// ==========================================
let ordersTable = [
    {
        id: 1,
        customer_name: "Nguyễn Văn A",
        customer_email: "nguyenvana@gmail.com",
        total_amount: 25000000.00,
        status: "pending", // pending, completed, cancelled
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }
];

let orderItemsTable = [
    {
        id: 1,
        order_id: 1,
        product_id: 1,
        product_name: "Laptop Dell XPS 13",
        quantity: 1,
        unit_price: 25000000.00,
        total_price: 25000000.00
    }
];

// Hàm hỗ trợ tính lại tổng tiền (total_amount) cho một đơn hàng
const recalculateOrderTotal = (orderId) => {
    const order = ordersTable.find(o => o.id === orderId);
    if (order) {
        const items = orderItemsTable.filter(item => item.order_id === orderId);
        order.total_amount = items.reduce((sum, item) => sum + item.total_price, 0);
        order.updated_at = new Date().toISOString();
    }
};

// ==========================================
// MIDDLEWARE XÁC THỰC QUA AUTH SERVICE (BÀI 2)
// ==========================================
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: "Chưa cung cấp Token xác thực!" });
    }

    try {
        const response = await fetch(AUTH_SERVICE_URL, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            req.authHeader = authHeader; // Lưu lại header để gọi sang Product Service
            next();
        } else {
            return res.status(403).json({ message: "Token không hợp lệ hoặc bị từ chối bởi Auth Service (Bài 2)!" });
        }
    } catch (error) {
        return res.status(500).json({ message: "Không thể kết nối tới Auth Service (cổng 3000)!" });
    }
};

// ==========================================
// PHẦN 1: API QUẢN LÝ ĐƠN HÀNG (/orders)
// ==========================================

// 1. GET /orders - Lấy danh sách tất cả đơn hàng
app.get('/orders', authenticateToken, (req, res) => {
    res.json({
        status: "success",
        data: ordersTable
    });
});

// 2. GET /orders/:id - Lấy thông tin chi tiết một đơn hàng (kèm danh sách mặt hàng)
app.get('/orders/:id', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id);
    const order = ordersTable.find(o => o.id === id);

    if (!order) {
        return res.status(404).json({ message: "Không tìm thấy đơn hàng!" });
    }

    const items = orderItemsTable.filter(item => item.order_id === id);

    res.json({
        status: "success",
        data: {
            ...order,
            items: items
        }
    });
});

// 3. POST /orders - Tạo đơn hàng mới (có kiểm tra tồn kho từ Product Service)
app.post('/orders', authenticateToken, async (req, res) => {
    const { customer_name, customer_email, items } = req.body;

    if (!customer_name || !customer_email) {
        return res.status(400).json({ message: "Vui lòng nhập customer_name và customer_email!" });
    }

    const orderItemsInput = Array.isArray(items) ? items : [];
    const validatedItems = [];
    let totalAmount = 0;

    try {
        // Bước 1: Gọi sang Product Service (cổng 3001) để kiểm tra tồn kho từng sản phẩm
        for (const item of orderItemsInput) {
            const prodRes = await fetch(`${PRODUCT_SERVICE_URL}/${item.product_id}`, {
                method: 'GET',
                headers: { 'Authorization': req.authHeader }
            });

            if (!prodRes.ok) {
                return res.status(404).json({ message: `Không tìm thấy sản phẩm có ID = ${item.product_id} bên Product Service!` });
            }

            const prodJson = await prodRes.json();
            const product = prodJson.data;

            if (product.quantity < item.quantity) {
                return res.status(400).json({
                    message: `Sản phẩm "${product.name}" không đủ tồn kho! (Còn lại: ${product.quantity}, Yêu cầu: ${item.quantity})`
                });
            }

            const itemTotal = product.price * item.quantity;
            totalAmount += itemTotal;

            validatedItems.push({
                product_id: product.id,
                product_name: product.name,
                quantity: item.quantity,
                unit_price: product.price,
                total_price: itemTotal,
                remaining_stock: product.quantity - item.quantity
            });
        }

        // Bước 2: Cập nhật trừ số lượng tồn kho bên Product Service
        for (const vItem of validatedItems) {
            await fetch(`${PRODUCT_SERVICE_URL}/${vItem.product_id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': req.authHeader
                },
                body: JSON.stringify({ quantity: vItem.remaining_stock })
            });
        }

        // Bước 3: Lưu đơn hàng mới vào ordersTable
        const now = new Date().toISOString();
        const newOrderId = ordersTable.length > 0 ? Math.max(...ordersTable.map(o => o.id)) + 1 : 1;

        const newOrder = {
            id: newOrderId,
            customer_name,
            customer_email,
            total_amount: totalAmount,
            status: "pending",
            created_at: now,
            updated_at: now
        };
        ordersTable.push(newOrder);

        // Bước 4: Lưu chi tiết từng mặt hàng vào orderItemsTable
        const createdItems = [];
        for (const vItem of validatedItems) {
            const newItemId = orderItemsTable.length > 0 ? Math.max(...orderItemsTable.map(i => i.id)) + 1 : 1;
            const newOrderItem = {
                id: newItemId,
                order_id: newOrderId,
                product_id: vItem.product_id,
                product_name: vItem.product_name,
                quantity: vItem.quantity,
                unit_price: vItem.unit_price,
                total_price: vItem.total_price
            };
            orderItemsTable.push(newOrderItem);
            createdItems.push(newOrderItem);
        }

        return res.status(201).json({
            message: "Tạo đơn hàng thành công!",
            data: {
                ...newOrder,
                items: createdItems
            }
        });
    } catch (error) {
        return res.status(500).json({ message: "Lỗi khi kết nối tới Product Service (cổng 3001)!" });
    }
});

// 4. PUT /orders/:id - Cập nhật trạng thái đơn hàng
app.put('/orders/:id', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id);
    const order = ordersTable.find(o => o.id === id);

    if (!order) {
        return res.status(404).json({ message: "Không tìm thấy đơn hàng!" });
    }

    const { customer_name, customer_email, status } = req.body;
    const validStatuses = ['pending', 'completed', 'cancelled'];

    if (status !== undefined) {
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ message: "Trạng thái không hợp lệ! Chỉ chấp nhận: pending, completed, cancelled" });
        }
        order.status = status;
    }

    if (customer_name !== undefined) order.customer_name = customer_name;
    if (customer_email !== undefined) order.customer_email = customer_email;
    order.updated_at = new Date().toISOString();

    res.json({
        message: "Cập nhật đơn hàng thành công!",
        data: order
    });
});

// 5. DELETE /orders/:id - Xóa một đơn hàng (và xóa các chi tiết đơn hàng liên quan)
app.delete('/orders/:id', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id);
    const index = ordersTable.findIndex(o => o.id === id);

    if (index === -1) {
        return res.status(404).json({ message: "Không tìm thấy đơn hàng!" });
    }

    const deletedOrder = ordersTable.splice(index, 1)[0];
    orderItemsTable = orderItemsTable.filter(item => item.order_id !== id);

    res.json({
        message: "Xóa đơn hàng thành công!",
        data: deletedOrder
    });
});

// ==========================================
// PHẦN 2: API CHI TIẾT ĐƠN HÀNG (/order_items)
// ==========================================

// 1. GET /order_items - Lấy danh sách tất cả mặt hàng trong đơn hàng
app.get('/order_items', authenticateToken, (req, res) => {
    res.json({
        status: "success",
        data: orderItemsTable
    });
});

// 2. GET /order_items/:id - Lấy thông tin chi tiết một mặt hàng
app.get('/order_items/:id', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id);
    const item = orderItemsTable.find(i => i.id === id);

    if (!item) {
        return res.status(404).json({ message: "Không tìm thấy chi tiết mặt hàng!" });
    }

    res.json({
        status: "success",
        data: item
    });
});

// 3. POST /order_items - Tạo mặt hàng mới trong đơn hàng
app.post('/order_items', authenticateToken, async (req, res) => {
    const { order_id, product_id, quantity } = req.body;

    if (!order_id || !product_id || !quantity) {
        return res.status(400).json({ message: "Vui lòng nhập đầy đủ: order_id, product_id, quantity!" });
    }

    const order = ordersTable.find(o => o.id === parseInt(order_id));
    if (!order) {
        return res.status(404).json({ message: "Không tìm thấy đơn hàng tương ứng với order_id!" });
    }

    try {
        // Lấy thông tin sản phẩm & kiểm tra tồn kho từ Product Service
        const prodRes = await fetch(`${PRODUCT_SERVICE_URL}/${product_id}`, {
            method: 'GET',
            headers: { 'Authorization': req.authHeader }
        });

        if (!prodRes.ok) {
            return res.status(404).json({ message: "Không tìm thấy sản phẩm bên Product Service!" });
        }

        const prodJson = await prodRes.json();
        const product = prodJson.data;

        if (product.quantity < quantity) {
            return res.status(400).json({ message: `Số lượng tồn kho không đủ (Còn lại: ${product.quantity})!` });
        }

        const newItem = {
            id: orderItemsTable.length > 0 ? Math.max(...orderItemsTable.map(i => i.id)) + 1 : 1,
            order_id: parseInt(order_id),
            product_id: product.id,
            product_name: product.name,
            quantity: parseInt(quantity),
            unit_price: product.price,
            total_price: product.price * parseInt(quantity)
        };

        orderItemsTable.push(newItem);
        recalculateOrderTotal(parseInt(order_id));

        return res.status(201).json({
            message: "Thêm mặt hàng vào đơn hàng thành công!",
            data: newItem
        });
    } catch (error) {
        return res.status(500).json({ message: "Lỗi khi kết nối tới Product Service (cổng 3001)!" });
    }
});

// 4. PUT /order_items/:id - Cập nhật mặt hàng
app.put('/order_items/:id', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id);
    const item = orderItemsTable.find(i => i.id === id);

    if (!item) {
        return res.status(404).json({ message: "Không tìm thấy mặt hàng!" });
    }

    const { quantity, unit_price } = req.body;

    if (quantity !== undefined) item.quantity = parseInt(quantity);
    if (unit_price !== undefined) item.unit_price = parseFloat(unit_price);
    item.total_price = item.quantity * item.unit_price;

    recalculateOrderTotal(item.order_id);

    res.json({
        message: "Cập nhật mặt hàng thành công!",
        data: item
    });
});

// 5. DELETE /order_items/:id - Xóa một mặt hàng trong đơn hàng
app.delete('/order_items/:id', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id);
    const index = orderItemsTable.findIndex(i => i.id === id);

    if (index === -1) {
        return res.status(404).json({ message: "Không tìm thấy mặt hàng!" });
    }

    const deletedItem = orderItemsTable.splice(index, 1)[0];
    recalculateOrderTotal(deletedItem.order_id);

    res.json({
        message: "Xóa mặt hàng khỏi đơn hàng thành công!",
        data: deletedItem
    });
});

// Khởi chạy Order Management Service tại cổng 3002
app.listen(PORT, () => {
    console.log(`Order Management Service đang chạy tại http://localhost:${PORT}`);
});