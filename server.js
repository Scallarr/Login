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
  const multer = require("multer");
  const http = require("http");
  const { Server } = require("socket.io");
  const otpStore = {};
  const upload = multer({ storage: multer.memoryStorage() });

  const app = express()
  app.use(cors())
  app.use(express.json())
  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: "*"
    }
  });




  cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET,
  });
  module.exports = cloudinary;




  const PERSPECTIVE_API_KEY = "AIzaSyDKHBzVBCLpeBbPlz18w2bM5eWkw-Kgne4";
  const SECRET_KEY = "TestSecretKey"

  // 🔹 MySQL
  const db = mysql.createPool({
    host: "b4k7lvucka06qzmkt9oe-mysql.services.clever-cloud.com",
    user: "u8yx08gazmxrgesr",
    password: "WiyM2e4CES1FbDdsQ5Vh",
    database: "b4k7lvucka06qzmkt9oe",
    timezone: "+07:00"
  })




  console.log("BREVO KEY exists:", !!process.env.BREVO_SMTP_KEY);

  async function sendOtpMail(email, otp) {
    await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: {
          name: " ทีมงาน ขวัญใจตี๋",
          email: "kasiditkosit@gmail.com",
        },
        to: [
          {
            email: email,
          },
        ],
        subject: "OTP Verification Code",
        htmlContent: `
          <div style="font-family: Arial, sans-serif; color: #333;">
            <h2>OTP Verification</h2>
            <p>เรียน คนนครสวรรค์ และจังหวัดอื่นๆทั่วประเทศไทย </p>
            <p>
              กรุณาใช้รหัส OTP ด้านล่างเพื่อยืนยันว่ามึงเป็นคนนครสวรรค์จริงๆ
            </p>
            <h1 style="letter-spacing: 6px;">${otp}</h1>
            <p>รหัสมีอายุ 5 นาที</p>
            <p>ทีมงาน ขวัญใจตี๋</p>
          </div>
        `,
      },
      {
        headers: {
          "api-key": process.env.BREVO_SMTP_KEY,
          "Content-Type": "application/json",
        },
      }
    );
  }


  async function checkToxic(message) {
    if (!message) return false;

    try {
      const res = await axios.post(
        `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${PERSPECTIVE_API_KEY}`,
        {
          comment: { text: message },
          languages: ["en"],
          requestedAttributes: { TOXICITY: {} },
        }
      );

      const score =
        res.data.attributeScores.TOXICITY.summaryScore.value;

      console.log("TOXICITY SCORE:", score);

      return score > 0.7; // threshold 70%
    } catch (err) {
      console.error("Perspective API error:", err.message);
      return false;
    }
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

  app.get("/chat-history/:targetId", verifyToken, (req, res) => {
    const myId = req.user.id;
    const targetId = req.params.targetId;

    db.query(
      `
      SELECT id, sender_id, receiver_id, message, image, created_at
      FROM messages
      WHERE
        (sender_id = ? AND receiver_id = ?)
        OR
        (sender_id = ? AND receiver_id = ?)
      ORDER BY created_at ASC
      `,
      [myId, targetId, targetId, myId],
      (err, results) => {
        if (err) return res.status(500).json({ message: "DB error" });
        res.json(results);
      }
    );
  });

  app.delete("/delete-message/:id", verifyToken, (req, res) => {
    const msgId = req.params.id;
    const userId = req.user.id;

    db.query(
      "SELECT * FROM messages WHERE id = ? AND sender_id = ?",
      [msgId, userId],
      (err, results) => {
        if (err) return res.status(500).json({ message: "DB error" });
        if (results.length === 0) return res.status(403).json({ message: "Not allowed" });

        db.query("DELETE FROM messages WHERE id = ?", [msgId], (err) => {
          if (err) return res.status(500).json({ message: "Delete failed" });
          res.json({ message: "Deleted" });
        });
      }
    );
  });

  app.post("/upload-chat-image", verifyToken, upload.single("image"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file" });

    try {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { folder: "chat_images", resource_type: "image" },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        ).end(req.file.buffer);
      });

      res.json({ url: result.secure_url });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Upload failed" });
    }
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




  // Step 1: ส่ง OTP ไปที่ gmail สำหรับ forgot password
  app.post("/forgot-password-otp", (req, res) => {
    const { gmail } = req.body;

    if (!gmail) return res.status(400).json({ message: "กรุณากรอก Gmail" });

    db.query("SELECT * FROM users WHERE email = ?", [gmail], async (err, results) => {
      if (err) return res.status(500).json({ message: "DB error" });
      if (results.length === 0) return res.status(404).json({ message: "ไม่พบอีเมลนี้ในระบบ" });

      // ลบ OTP เก่า
      db.query("DELETE FROM otp_codes WHERE email = ?", [gmail]);

      const otp = Math.floor(100000 + Math.random() * 900000);
      const expire = new Date(Date.now() + 5 * 60 * 1000);

      db.query(
        "INSERT INTO otp_codes (email, otp, expire_at) VALUES (?, ?, ?)",
        [gmail, otp, expire],
        async (err) => {
          if (err) return res.status(500).json({ message: "OTP save failed" });

          try {
            await sendOtpMail(gmail, otp);
            res.json({ message: "OTP sent to your email" });
          } catch (mailErr) {
            console.error(mailErr);
            res.status(500).json({ message: "Send email failed" });
          }
        }
      );
    });
  });

  // Step 2: ยืนยัน OTP สำหรับ forgot password
  app.post("/verify-forgot-otp", (req, res) => {
    const { gmail, otp } = req.body;

    if (!gmail || !otp) return res.status(400).json({ message: "Missing fields" });

    db.query(
      "SELECT * FROM otp_codes WHERE email = ? AND otp = ? AND expire_at > NOW()",
      [gmail, otp],
      (err, results) => {
        if (err) return res.status(500).json({ message: "DB error" });
        if (results.length === 0) return res.status(400).json({ message: "OTP ไม่ถูกต้องหรือหมดอายุ" });

        res.json({ message: "OTP verified" });
      }
    );
  });

  // Step 3: เปลี่ยนรหัสผ่านใหม่
  app.post("/reset-password", (req, res) => {
    const { gmail, otp, newPassword } = req.body;

    if (!gmail || !otp || !newPassword) return res.status(400).json({ message: "Missing fields" });

    // เช็ค OTP อีกรอบเพื่อความปลอดภัย
    db.query(
      "SELECT * FROM otp_codes WHERE email = ? AND otp = ? AND expire_at > NOW()",
      [gmail, otp],
      async (err, results) => {
        if (err) return res.status(500).json({ message: "DB error" });
        if (results.length === 0) return res.status(400).json({ message: "OTP ไม่ถูกต้องหรือหมดอายุ" });

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        db.query(
          "UPDATE users SET password = ? WHERE email = ?",
          [hashedPassword, gmail],
          (err) => {
            if (err) return res.status(500).json({ message: "Reset failed" });

            // ลบ OTP หลังใช้งาน
            db.query("DELETE FROM otp_codes WHERE email = ?", [gmail]);

            res.json({ message: "เปลี่ยนรหัสผ่านสำเร็จ" });
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
            try {
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
            } catch (uploadErr) {
              console.error("Cloudinary upload failed, using Google URL:", uploadErr.message);
              imageUrl = picture;
            }
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


  app.get("/all-users", (req, res) => {
    db.query(
      "SELECT id, name FROM users",
      (err, results) => res.json(results)
    );
  });






  const userSocketMap = {};

  io.on("connection", (socket) => {
    console.log("🟢 Socket connected:", socket.id);

    socket.on("joinUser", (userId) => {
      userSocketMap[userId] = socket.id;
    });

    socket.on("joinRoom", ({ userId, targetId }) => {
      const room =
        userId < targetId
          ? `${userId}_${targetId}`
          : `${targetId}_${userId}`;

      socket.join(room);
    });

    socket.on("deleteMessage", ({ senderId, receiverId, messageId }) => {
      const room =
        senderId < receiverId
          ? `${senderId}_${receiverId}`
          : `${receiverId}_${senderId}`;

      io.to(room).emit("messageDeleted", { messageId });
    });

    socket.on("sendMessage", async (data) => {
      const { senderId, receiverId, message, image } = data;

      const room =
        senderId < receiverId
          ? `${senderId}_${receiverId}`
          : `${receiverId}_${senderId}`;

  const isToxic = await checkToxic(message);

  if (isToxic) {
    return socket.emit("messageBlocked", {
      error: "ข้อความไม่เหมาะสม กรุณาใช้ถ้อยคำสุภาพ",
    });
  }
          
      db.query(
        "INSERT INTO messages (sender_id, receiver_id, message, image) VALUES (?, ?, ?, ?)",
        [senderId, receiverId, message || null, image || null],
        (err, result) => {
          if (err) return;

          const payload = { id: result.insertId, senderId, receiverId, message, image, time: new Date() };

          io.to(room).emit("receiveMessage", payload);

          const receiverSocketId = userSocketMap[receiverId];
          if (receiverSocketId) {
            const receiverSocket = io.sockets.sockets.get(receiverSocketId);
            if (receiverSocket && !receiverSocket.rooms.has(room)) {
              receiverSocket.emit("receiveMessage", payload);
            }
          }
        }
      );
    });

    socket.on("disconnect", () => {
      for (const [userId, sid] of Object.entries(userSocketMap)) {
        if (sid === socket.id) {
          delete userSocketMap[userId];
          break;
        }
      }
      console.log("🔴 Socket disconnected:", socket.id);
    });
  });




  server.listen(3001, () => {
    console.log("🚀 Server running on port 3001")
  })









