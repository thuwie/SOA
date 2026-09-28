const express = require('express');
const jwt = require('jsonwebtoken');
const app = express();

const PORT = 3000;
const SECRET_KEY = 'ma_bao_mat_jwt_secret';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Giả lập cơ sở dữ liệu Bảng người dùng (User) theo yêu cầu đề bài
const usersTable = [
    {
        IdUser: 1,
        UserName: "admin",
        // Ví dụ password dạng Base64 của "123456" là "MTIzNDU2"
        Password: "MTIzNDU2",
        Token: ""
    }
];

// 1. ROUTER ĐĂNG NHẬP (POST http://localhost:3000/)
app.post('/', (req, res) => {
    const { userName, password } = req.body;

    if (!userName || !password) {
        return res.status(400).json({ message: "Vui lòng nhập userName và password" });
    }

    // Tìm người dùng trong cơ sở dữ liệu
    const user = usersTable.find(u => u.UserName === userName && u.Password === password);

    if (!user) {
        return res.status(401).json({ message: "Tài khoản hoặc mật khẩu không chính xác" });
    }

    // Sinh Token JWT (hạn sử dụng 1 giờ)
    const token = jwt.sign(
        { IdUser: user.IdUser, UserName: user.UserName },
        SECRET_KEY,
        { expiresIn: '1h' }
    );

    // Lưu Token vào bảng User
    user.Token = token;

    return res.json({
        message: "Đăng nhập thành công!",
        token: token,
        user: {
            IdUser: user.IdUser,
            UserName: user.UserName
        }
    });
});

// 2. MIDDLEWARE XÁC THỰC TOKEN
const authenticateToken = (req, res, next) => {
    // Lấy token từ header Authorization (dạng 'Bearer <token>')
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: "Không tìm thấy Token xác thực" });
    }

    // Xác thực token
    jwt.verify(token, SECRET_KEY, (err, decodedUser) => {
        if (err) {
            return res.status(403).json({ message: "Token không hợp lệ hoặc đã hết hạn" });
        }

        // Lưu thông tin giải mã vào request để các API sau sử dụng
        req.user = decodedUser;
        next();
    });
};

// 3. API XÁC THỰC TOKEN (GET/POST http://localhost:3000/auth)
app.get('/auth', authenticateToken, (req, res) => {
    res.send("Hello World");
});

// Khởi chạy Server
app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
});