const express = require('express');
const app = express();

const PORT = 3003; // Cổng riêng cho Reporting Service (SOA)
const AUTH_SERVICE_URL = 'http://localhost:3000/auth';
const PRODUCT_SERVICE_URL = 'http://localhost:3001/products';
const ORDER_SERVICE_URL = 'http://localhost:3002/orders';
const ORDER_ITEMS_SERVICE_URL = 'http://localhost:3002/order_items';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// GIẢ LẬP CƠ SỞ DỮ LIỆU (ORDERS_REPORTS & PRODUCT_REPORTS)
// ==========================================
let ordersReportsTable = [
    {
        id: 1,
        order_id: 1,
        total_revenue: 25000000.00,
        total_cost: 20000000.00,
        total_profit: 5000000.00
    }
];

let productReportsTable = [
    {
        id: 1,
        order_report_id: 1,
        product_id: 1,
        total_sold: 1,
        revenue: 25000000.00,
        cost: 20000000.00,
        profit: 5000000.00
    }
];

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
            req.authHeader = authHeader; // Lưu lại header để gọi sang Product & Order Service
            next();
        } else {
            return res.status(403).json({ message: "Token không hợp lệ hoặc bị từ chối bởi Auth Service (Bài 2)!" });
        }
    } catch (error) {
        return res.status(500).json({ message: "Không thể kết nối tới Auth Service (cổng 3000)!" });
    }
};

// ==========================================
// PHẦN 1: API BÁO CÁO ĐƠN HÀNG (/reports/orders)
// ==========================================

// 1. GET /reports/orders - Lấy danh sách tất cả các báo cáo theo đơn hàng
app.get('/reports/orders', authenticateToken, (req, res) => {
    res.json({
        status: "success",
        data: ordersReportsTable
    });
});

// 2. GET /reports/orders/:id - Lấy chi tiết báo cáo cho một đơn hàng
app.get('/reports/orders/:id', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id);
    const report = ordersReportsTable.find(r => r.id === id);

    if (!report) {
        return res.status(404).json({ message: "Không tìm thấy báo cáo đơn hàng!" });
    }

    // Lấy kèm danh sách báo cáo sản phẩm thuộc báo cáo đơn hàng này
    const productDetails = productReportsTable.filter(p => p.order_report_id === id);

    res.json({
        status: "success",
        data: {
            ...report,
            product_reports: productDetails
        }
    });
});

// 3. POST /reports/orders - Tạo báo cáo đơn hàng mới từ dữ liệu Order Service
app.post('/reports/orders', authenticateToken, async (req, res) => {
    const { order_id, total_cost, cost_ratio } = req.body;

    if (!order_id) {
        return res.status(400).json({ message: "Vui lòng cung cấp order_id!" });
    }

    try {
        // Gọi sang Order Service (cổng 3002) lấy thông tin đơn hàng
        const orderRes = await fetch(`${ORDER_SERVICE_URL}/${order_id}`, {
            method: 'GET',
            headers: { 'Authorization': req.authHeader }
        });

        if (!orderRes.ok) {
            return res.status(404).json({ message: `Không tìm thấy đơn hàng có ID = ${order_id} bên Order Service!` });
        }

        const orderJson = await orderRes.json();
        const order = orderJson.data;

        // Tính doanh thu, chi phí và lợi nhuận
        const totalRevenue = parseFloat(order.total_amount) || 0;
        let calculatedCost = 0;

        if (total_cost !== undefined) {
            calculatedCost = parseFloat(total_cost);
        } else if (cost_ratio !== undefined) {
            calculatedCost = totalRevenue * parseFloat(cost_ratio);
        } else {
            // Mặc định chi phí nhập bằng 70% doanh thu nếu không truyền tham số chi phí
            calculatedCost = totalRevenue * 0.7;
        }

        const totalProfit = totalRevenue - calculatedCost;

        const newReport = {
            id: ordersReportsTable.length > 0 ? Math.max(...ordersReportsTable.map(r => r.id)) + 1 : 1,
            order_id: parseInt(order_id),
            total_revenue: parseFloat(totalRevenue.toFixed(2)),
            total_cost: parseFloat(calculatedCost.toFixed(2)),
            total_profit: parseFloat(totalProfit.toFixed(2))
        };

        ordersReportsTable.push(newReport);

        return res.status(201).json({
            message: "Tạo báo cáo đơn hàng thành công!",
            data: newReport
        });
    } catch (error) {
        return res.status(500).json({ message: "Lỗi khi kết nối tới Order Service (cổng 3002)!" });
    }
});

// 4. DELETE /reports/orders/:id - Xóa báo cáo đơn hàng
app.delete('/reports/orders/:id', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id);
    const index = ordersReportsTable.findIndex(r => r.id === id);

    if (index === -1) {
        return res.status(404).json({ message: "Không tìm thấy báo cáo đơn hàng!" });
    }

    const deletedReport = ordersReportsTable.splice(index, 1)[0];

    res.json({
        message: "Xóa báo cáo đơn hàng thành công!",
        data: deletedReport
    });
});

// ==========================================
// PHẦN 2: API BÁO CÁO SẢN PHẨM (/reports/products)
// ==========================================

// 5. GET /reports/products - Lấy danh sách tất cả các báo cáo theo sản phẩm
app.get('/reports/products', authenticateToken, (req, res) => {
    res.json({
        status: "success",
        data: productReportsTable
    });
});

// 6. GET /reports/products/:id - Lấy chi tiết báo cáo cho một sản phẩm
app.get('/reports/products/:id', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id);
    const report = productReportsTable.find(r => r.id === id);

    if (!report) {
        return res.status(404).json({ message: "Không tìm thấy báo cáo sản phẩm!" });
    }

    res.json({
        status: "success",
        data: report
    });
});

// 7. POST /reports/products - Tạo báo cáo sản phẩm mới từ Product Service & Order Service
app.post('/reports/products', authenticateToken, async (req, res) => {
    const { product_id, order_report_id, unit_cost, cost } = req.body;

    if (!product_id) {
        return res.status(400).json({ message: "Vui lòng cung cấp product_id!" });
    }

    try {
        // Bước 1: Gọi Product Service (cổng 3001) kiểm tra sản phẩm và lấy thông tin tồn kho/giá
        const prodRes = await fetch(`${PRODUCT_SERVICE_URL}/${product_id}`, {
            method: 'GET',
            headers: { 'Authorization': req.authHeader }
        });

        if (!prodRes.ok) {
            return res.status(404).json({ message: `Không tìm thấy sản phẩm ID = ${product_id} bên Product Service!` });
        }

        const prodJson = await prodRes.json();
        const product = prodJson.data;

        // Bước 2: Gọi Order Service (cổng 3002) lấy danh sách mặt hàng đã đặt để tính số lượng bán & doanh thu
        const itemsRes = await fetch(ORDER_ITEMS_SERVICE_URL, {
            method: 'GET',
            headers: { 'Authorization': req.authHeader }
        });

        if (!itemsRes.ok) {
            return res.status(500).json({ message: "Không thể lấy dữ liệu chi tiết đơn hàng từ Order Service!" });
        }

        const itemsJson = await itemsRes.json();
        let matchedItems = itemsJson.data.filter(item => item.product_id === parseInt(product_id));

        // Nếu có truyền order_report_id hợp lệ, lọc theo đúng order_id của báo cáo đó
        let linkedOrderReportId = null;
        if (order_report_id !== undefined) {
            const orderReport = ordersReportsTable.find(r => r.id === parseInt(order_report_id));
            if (!orderReport) {
                return res.status(404).json({ message: `Không tìm thấy order_report_id = ${order_report_id}!` });
            }
            linkedOrderReportId = orderReport.id;
            matchedItems = matchedItems.filter(item => item.order_id === orderReport.order_id);
        }

        // Tính tổng số lượng đã bán & doanh thu
        const totalSold = matchedItems.reduce((sum, item) => sum + item.quantity, 0);
        const revenue = matchedItems.reduce((sum, item) => sum + item.total_price, 0);

        // Tính chi phí nhập & lợi nhuận
        let calculatedCost = 0;
        if (cost !== undefined) {
            calculatedCost = parseFloat(cost);
        } else if (unit_cost !== undefined) {
            calculatedCost = totalSold * parseFloat(unit_cost);
        } else {
            calculatedCost = revenue * 0.7; // Mặc định chi phí 70% doanh thu
        }

        const profit = revenue - calculatedCost;

        const newProductReport = {
            id: productReportsTable.length > 0 ? Math.max(...productReportsTable.map(r => r.id)) + 1 : 1,
            order_report_id: linkedOrderReportId,
            product_id: parseInt(product_id),
            total_sold: totalSold,
            revenue: parseFloat(revenue.toFixed(2)),
            cost: parseFloat(calculatedCost.toFixed(2)),
            profit: parseFloat(profit.toFixed(2))
        };

        productReportsTable.push(newProductReport);

        return res.status(201).json({
            message: "Tạo báo cáo sản phẩm thành công!",
            product_info: {
                name: product.name,
                remaining_stock: product.quantity
            },
            data: newProductReport
        });
    } catch (error) {
        return res.status(500).json({ message: "Lỗi khi kết nối tới Product Service hoặc Order Service!" });
    }
});

// 8. DELETE /reports/products/:id - Xóa báo cáo sản phẩm
app.delete('/reports/products/:id', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id);
    const index = productReportsTable.findIndex(r => r.id === id);

    if (index === -1) {
        return res.status(404).json({ message: "Không tìm thấy báo cáo sản phẩm!" });
    }

    const deletedReport = productReportsTable.splice(index, 1)[0];

    res.json({
        message: "Xóa báo cáo sản phẩm thành công!",
        data: deletedReport
    });
});

// Khởi chạy Reporting Service tại cổng 3003
app.listen(PORT, () => {
    console.log(`Reporting Service đang chạy tại http://localhost:${PORT}`);
});