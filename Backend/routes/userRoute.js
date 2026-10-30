const {Router}= require("express");
const {getUserByLocation,login,signup,deleteUserById,updateUserById, getUserById}=require("../controller/userController")
const router=Router()
const authmiddleware=require("../middleware/authMiddleware")

router.get("/profile",authmiddleware, (req,res)=>{
  res.status(200).json({message:"TOKEN VALID",userId:req.userId})
})
router.get("/",getUserByLocation);
router.get("/:id",getUserById)
router.put("/:id",authmiddleware,updateUserById)
router.delete("/:id",authmiddleware,deleteUserById)
router.post("/signup",signup)
router.post("/login",login)


module.exports= router