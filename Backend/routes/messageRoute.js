const {Router}=require("express")
const router= Router();
const authmiddleware=require("../middleware/authMiddleware")
const {sendMessage,getMessages,deleteConversation}=require("../controller/messageController")

router.post("/",authmiddleware,sendMessage);
router.delete("/:userId",authmiddleware,deleteConversation);
router.get("/:userId",authmiddleware,getMessages)

module.exports=router
