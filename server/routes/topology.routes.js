const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getTorres, saveTorre, deleteTorre } = require('../db.service');

// Configuración Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Max 5MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos PDF'));
        }
    }
});

router.get('/topology/torres', async (req, res) => {
    try {
        const torres = await getTorres();
        res.json({ success: true, torres });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// Guardar o Actualizar Torre (Acepta datos como JSON y 'contrato' en form-data si va con archivo)
router.post('/topology/torre', upload.single('contrato'), async (req, res) => {
    try {
        let torreData;
        if (req.body.torreData) {
            torreData = JSON.parse(req.body.torreData);
        } else {
            torreData = req.body;
        }

        if (!torreData.id) torreData.id = uuidv4();
        
        if (req.file) {
            torreData.pdf_path = req.file.filename;
        }

        const saved = await saveTorre(torreData);
        res.json({ success: true, torre: saved });
    } catch (e) {
        if (req.file) {
            // Eliminar archivo si falla BD
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ success: false, message: e.message });
    }
});

router.delete('/topology/torre/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const pdfFilename = await deleteTorre(id);
        if (pdfFilename) {
            const filePath = path.join(__dirname, '..', 'uploads', pdfFilename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        res.json({ success: true, message: 'Torre eliminada' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
