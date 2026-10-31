const {Router}= require("express");
const {getUserByLocation,login,signup,deleteUserById,updateUserById, getUserById,getOwnProfile,blockUser,unblockUser,getBlockedUsers}=require("../controller/userController")
const router=Router()
const authmiddleware=require("../middleware/authMiddleware")

router.get("/profile",authmiddleware,getOwnProfile)
router.patch("/profile",authmiddleware,updateUserById)
router.get("/",authmiddleware,getUserByLocation);
router.get("/blocked",authmiddleware,getBlockedUsers)
router.post("/:id/block",authmiddleware,blockUser)
router.delete("/:id/block",authmiddleware,unblockUser)
router.get("/:id",getUserById)
router.put("/:id",authmiddleware,updateUserById)
router.delete("/:id",authmiddleware,deleteUserById)
router.post("/signup",signup)
router.post("/login",login)


module.exports= router
