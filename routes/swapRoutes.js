const express = require("express");
const swapController = require("../controllers/swapController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/send", authMiddleware, swapController.sendSwapRequest);
router.post("/accept/:id", authMiddleware, swapController.acceptSwapRequest);
router.post("/reject/:id", authMiddleware, swapController.rejectSwapRequest);
router.post("/cancel/:id", authMiddleware, swapController.cancelSwapRequest);

router.get("/all", authMiddleware, swapController.getAllSwapRequests);

module.exports = router;
