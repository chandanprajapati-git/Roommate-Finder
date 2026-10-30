const {Router}=require("express")
const router= Router();
const authmiddleware=require("../middleware/authMiddleware")
const {sendMessage,getMessages}=require("../controller/messageController")

router.post("/",authmiddleware,sendMessage);
router.get("/:userId",authmiddleware,getMessages)

module.exports=router