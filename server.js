// Load environment variables from .env file
require('dotenv').config();

const express = require("express")
const mysql = require("mysql2")
const cors = require("cors")
const jwt = require("jsonwebtoken")
const bcrypt = require("bcrypt")
const cloudinary = require("cloudinary").v2;
const axios = require("axios");
const nodemailer = require("nodemailer");
const otpStore = {};


cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});
module.exports = cloudinary;




const app = express()
app.use(cors())
app.use(express.json())

const SECRET_KEY = "TestSecretKey"

// 🔹 MySQL
const db = mysql.createConnection({
  host: "b4k7lvucka06qzmkt9oe-mysql.services.clever-cloud.com",
  user: "u8yx08gazmxrgesr",
  password: "WiyM2e4CES1FbDdsQ5Vh",
  database: "b4k7lvucka06qzmkt9oe"
})

db.connect(err => {
  if (err) throw err
  console.log("✅ MySQL Connected")
})



async function sendOtpMail(email, otp) {
  const transporter = nodemailer.createTransport({
   host: "smtp-relay.brevo.com",
      port: 587,
     secure: false,
    auth: {
      user: "apikey",      // Gmail ผู้ส่ง
      pass: "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",     // App Password
    },
  });

await transporter.sendMail({
  from: `"My App" <kasiditkosit@gmail.com>`,
  to: email,
  subject: "OTP Verification Code",
  html: `
    <div style="font-family: Arial, sans-serif; color: #333;">
      <h2>OTP Verification</h2>

      <p>เรียน ผู้ใช้งาน</p>

      <p>
        ตามที่ท่านได้ร้องขอการยืนยันตัวตน กรุณาใช้รหัสยืนยันแบบใช้ครั้งเดียว
        (One-Time Password: OTP) ด้านล่างนี้เพื่อดำเนินการต่อ
      </p>

      <h1 style="letter-spacing: 6px; color: #000;">
        ${otp}
      </h1>

      <p>
        รหัสนี้มีอายุการใช้งานภายใน <b>5 นาที</b>
        กรุณาอย่าเปิดเผยรหัสนี้แก่ผู้อื่น
      </p>

      <p>
        หากท่านไม่ได้เป็นผู้ร้องขอ กรุณาเพิกเฉยต่ออีเมลฉบับนี้
      </p>

      <br />
      <p>ขอแสดงความนับถือ</p>
      <p><b>My App Team</b></p>
    </div>
  `,
});

}





app.post("/register", (req, res) => {
  const { username, password,password2, gmail } = req.body;
console.log(username, password, gmail);

if (!username || !password || !gmail) {
    return res.status(400).json({ message: "Missing fields" });
  }

if (password !== password2) {
    return res.status(400).json({ message: "Passwords do not match" });
}



  db.query(
    "SELECT * FROM users WHERE email = ?",
    [gmail],
    async (err, results) => {
      if (err) return res.status(500).json({ message: "DB error" });
      console.log("DB Query Results:", results);
      if (results.length > 0)
        return res.status(400).json({ message: "Email already exists" });

      try {
        const hashedPassword = await bcrypt.hash(password, 10);
console.log("Hashed Password:", hashedPassword);
        db.query(
          "INSERT INTO users (name, password, email) VALUES (?, ?, ?)",
          [username, hashedPassword, gmail],
          (err) => {
            if (err)
              return res.status(500).json({ message: "Insert failed" });

            const otp = Math.floor(100000 + Math.random() * 900000);
            const expire = new Date(Date.now() + 5 * 60 * 1000);
console.log("Generated OTP:", otp);
            db.query(
              "INSERT INTO otp_codes (email, otp, expire_at) VALUES (?, ?, ?)",
              [gmail, otp, expire],
              async (err) => {
                if (err)
                  return res.status(500).json({ message: "OTP save failed" });

                try {
                  await sendOtpMail(gmail, otp);
                  res.json({ message: "OTP sent to your email" });
                } catch (mailErr) {
                  console.error(mailErr);
                  res.status(500).json({ message: "Send email failed" });
                }
              }
            );
          }
        );
      } catch (error) {
        res.status(500).json({ message: "Register failed" });
      }
    }
  );
});




app.post("/verify-otp", (req, res) => {
  const { gmail, otp } = req.body;

  db.query(
    "SELECT * FROM otp_codes WHERE email = ? AND otp = ? AND expire_at > NOW()",
    [gmail, otp],
    (err, results) => {
      if (err) return res.status(500).json({ message: "DB error" });

      if (results.length === 0) {
        return res.status(400).json({ message: "Invalid or expired OTP" });
      }

      // 🔍 ดึง user จาก email
      db.query(
        "SELECT id FROM users WHERE email = ?",
        [gmail],
        (err, users) => {
          if (err) return res.status(500).json({ message: "DB error" });

          if (users.length === 0) {
            return res.status(404).json({ message: "User not found" });
          }

          const userId = users[0].id;

          // ✅ update verify
          db.query(
            "UPDATE users SET is_verified = 1 WHERE email = ?",
            [gmail]
          );

          // 🧹 ลบ OTP
          db.query(
            "DELETE FROM otp_codes WHERE email = ?",
            [gmail]
          );

          // 🔑 สร้าง token
          const token = jwt.sign(
            { id: userId },
            SECRET_KEY,
            { expiresIn: "7d" }
          );

          res.json({
            message: "OTP verified",
            token
          });
        }
      );
    }
  );
});




app.post("/forgot-password", async (req, res) => {
  const { username, gmail, newPassword } = req.body;

  console.log(username, gmail, newPassword);

  db.query(
    "SELECT * FROM users WHERE name = ? AND email = ?",
    [username, gmail],
    async (err, results) => {

      if (err)
        return res.status(500).json({ message: "DB error" });

      if (results.length === 0) {
        return res
          .status(404)
          .json({ message: "User not found" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      db.query(
        "UPDATE users SET password = ? WHERE name = ?",
        [hashedPassword, username],
        () => {
          res.json({ message: "Password reset success" });
        }
      );
    }
  );
});










/* ================= LOGIN ================= */
app.post("/login" ,  (req, res) => {
  const { username, password } = req.body;
console.log(username, password);
  db.query(
    "SELECT * FROM users WHERE Email = ?",
    [username],
    async (err, result) => {
      if (err) return res.status(500).json(err);
      if (result.length === 0)
        return res.status(401).json({ message: "User not found" });

      const user = result[0];

      // 🔍 compare password
      const isMatch = await bcrypt.compare(password, user.password);

      if (!isMatch)
        return res.status(401).json({ message: "Password incorrect" });


       if (user.is_verified === 0) {
        console.log("Email not verified");
        return res.status(401).json({ message: "Email not verified" });
      }
           // 🔑 สร้าง token
            const token = jwt.sign(
              {
                id: user.id,
             
             
              },
              SECRET_KEY,
              { expiresIn: "7d" }
            );
console.log("Login success ", token);
      res.json({ message: "Login success", token   });
    }
  );
});



app.post("/resend-otp", async (req, res) => {
  const { gmail } = req.body;

  if (!gmail) {
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    // 🔥 ลบ OTP เก่า
    db.query("DELETE FROM otp_codes WHERE email = ?", [gmail]);

    // 🔐 สร้าง OTP ใหม่
    const otp = Math.floor(100000 + Math.random() * 900000);
    const expire = new Date(Date.now() + 5 * 60 * 1000); // 5 นาที

    // 💾 เก็บ OTP
    db.query(
      "INSERT INTO otp_codes (email, otp, expire_at) VALUES (?, ?, ?)",
      [gmail, otp, expire]
    );

    // 📧 ส่งเมล
    await sendOtpMail(gmail, otp);

    res.json({ message: "OTP resent successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to resend OTP" });
  }
});





/* ============== PROTECTED API ============== */
app.get("/profile", verifyToken, (req, res) => {
  res.json({
    message: "Welcome",
    user: req.user
  })
})

function verifyToken(req, res, next) {
  const bearer = req.headers["authorization"]
  if (!bearer) return res.sendStatus(403)

  const token = bearer.split(" ")[1]
  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) return res.sendStatus(403)
    req.user = decoded
    next()
  })
}


app.post("/addUser", async (req, res) => {
  const { username, email, picture } = req.body;
  console.log(username, email, picture);

  if (!username || !email) {
    return res.status(400).json({ message: "Missing username or email" });
  }

  db.query(
    "SELECT * FROM users WHERE name = ? AND email = ?",
    [username, email],
    async (err, results) => {
      if (err) {
        return res.status(500).json({ message: "DB error" });
      }

      if (results.length > 0) {
        // 🔑 user มีอยู่แล้ว → ออก token ได้เลย
        const user = results[0];

        const token = jwt.sign(
          {
            id: user.id,
            name: user.name,
            email: user.email,
          },
          SECRET_KEY,
          { expiresIn: "7d" }
        );

        return res.json({
          message: "User already exists",
          token,
          user,
        });
      }

      try {
        let imageUrl = null;

        if (picture) {
          console.log("Uploading image to Cloudinary...");
          const response = await axios.get(picture, {
            responseType: "arraybuffer",
            timeout: 10000,
            headers: {
              "User-Agent": "Mozilla/5.0",
            },
          });

          const uploadResult = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream(
              {
                folder: "avatars",
                public_id: `google_${username.replace(/\s+/g, "_")}`,
                overwrite: true,
                resource_type: "image",
              },
              (error, result) => {
                if (error) return reject(error);
                resolve(result);
              }
            ).end(Buffer.from(response.data));
          });

          imageUrl = uploadResult.secure_url;
        }

        // 💾 insert user
        db.query(
          "INSERT INTO users (name, password, email, profile_image, is_verified) VALUES (?, '', ?, ?, 1)",
          [username, email, imageUrl],
          (err, result) => {
            if (err) {
              return res.status(500).json({ message: "Insert failed" });
            }

            // 🔑 สร้าง token
            const token = jwt.sign(
              {
                id: result.insertId,
                name: username,
                email,
              },
              SECRET_KEY,
              { expiresIn: "7d" }
            );

            res.json({
              message: "User added",
              token,
              user: {
                id: result.insertId,
                name: username,
                email,
                profile_image: imageUrl,
              },
            });
          }
        );


        
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Add user failed" });
      }
    }
  );
});




app.get("/users", verifyToken, (req, res) => {
  const userId = req.user.id; // 🔑 id จาก token
console.log(userId);
  db.query(
    "SELECT id, name, email, profile_image FROM users WHERE id = ?",
    [userId],
    (err, results) => {
      if (err) {
        return res.status(500).json({ message: "DB error" });
      }

      // ป้องกันกรณี user ไม่เจอ
      if (results.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(results[0]); // ส่ง object เดียว
    }
  );
});


app.listen(3001, () => {
  console.log("🚀 Server running on port 3001")
})




