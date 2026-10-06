const express = require('express');
const jwt = require('jsonwebtoken');
const app = express();

const PORT = 3001; // Cổng riêng cho Product Service (SOA)
const SECRET_KEY = 'ma_bao_mat_jwt_secret'; // Khóa bí mật dùng chung với Lab 2

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Giả lập Cơ sở dữ liệu Bảng Sản phẩm (products)
let productsTable = [
    {
        id: 1,
        name: "Laptop Dell XPS 13",
        description: "Laptop cao cấp, mỏng nhẹ",
        price: 25000000.00,
        quantity: 10,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 2,
        name: "Bàn phím cơ Logitech",
        description: "Bàn phím cơ không dây",
        price: 1800000.00,
        quantity: 25,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }
];

// MIDDLEWARE XÁC THỰC QUA SERVICE BÀI 2 (SOA)
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: "Chưa cung cấp Token xác thực!" });
    }

    try {
        // Gọi HTTP Request sang Service Bài 2 (http://localhost:3000/auth) để xác thực
        const response = await fetch('http://localhost:3000/auth', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        // Nếu Service Bài 2 trả về status 200 OK
        if (response.ok) {
            next(); // Cho phép truy cập tiếp API quản lý sản phẩm
        } else {
            return res.status(403).json({ message: "Token không hợp lệ hoặc đã bị từ chối bởi Auth Service (Bài 2)!" });
        }
    } catch (error) {
        return res.status(500).json({ message: "Không thể kết nối tới Auth Service (Bài 2). Hãy đảm bảo app.js đang chạy!" });
    }
};

// CÁC API QUẢN LÝ SẢN PHẨM (YÊU CẦU BÀI 3)
// ==========================================
// 1. GET /products - Lấy danh sách tất cả sản phẩm
app.get('/products', authenticateToken, (req, res) => {
    res.json({
        status: "success",
        data: productsTable
    });
});

// 2. GET /products/:id - Lấy thông tin chi tiết một sản phẩm
app.get('/products/:id', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id);
    const product = productsTable.find(p => p.id === id);

    if (!product) {
        return res.status(404).json({ message: "Không tìm thấy sản phẩm!" });
    }

    res.json({
        status: "success",
        data: product
    });
});

// 3. POST /products - Thêm một sản phẩm mới
app.post('/products', authenticateToken, (req, res) => {
    const { name, description, price, quantity } = req.body;

    if (!name || price === undefined || quantity === undefined) {
        return res.status(400).json({ message: "Vui lòng điền đầy đủ: name, price, quantity!" });
    }

    const now = new Date().toISOString();
    const newProduct = {
        id: productsTable.length > 0 ? Math.max(...productsTable.map(p => p.id)) + 1 : 1,
        name: name,
        description: description || "",
        price: parseFloat(price),
        quantity: parseInt(quantity),
        created_at: now,
        updated_at: now
    };

    productsTable.push(newProduct);

    res.status(201).json({
        message: "Thêm sản phẩm thành công!",
        data: newProduct
    });
});

// 4. PUT /products/:id - Cập nhật thông tin sản phẩm
app.put('/products/:id', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id);
    const product = productsTable.find(p => p.id === id);

    if (!product) {
        return res.status(404).json({ message: "Không tìm thấy sản phẩm!" });
    }

    const { name, description, price, quantity } = req.body;

    if (name !== undefined) product.name = name;
    if (description !== undefined) product.description = description;
    if (price !== undefined) product.price = parseFloat(price);
    if (quantity !== undefined) product.quantity = parseInt(quantity);
    product.updated_at = new Date().toISOString();

    res.json({
        message: "Cập nhật sản phẩm thành công!",
        data: product
    });
});

// 5. DELETE /products/:id - Xóa một sản phẩm
app.delete('/products/:id', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id);
    const index = productsTable.findIndex(p => p.id === id);

    if (index === -1) {
        return res.status(404).json({ message: "Không tìm thấy sản phẩm!" });
    }

    const deletedProduct = productsTable.splice(index, 1)[0];

    res.json({
        message: "Xóa sản phẩm thành công!",
        data: deletedProduct
    });
});

// Khởi chạy Product Service tại cổng 3001
app.listen(PORT, () => {
    console.log(`Product Management Service đang chạy tại http://localhost:${PORT}`);
});