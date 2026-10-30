const User=require("../model/user")
const bcrypt=require("bcrypt")
const jwt=require("jsonwebtoken")

const getUserByLocation=async (req,res)=>{
  try{
    const {state,city}=req.query

    if(!state||!city){
      return res.status(400).json({message:"State and City is required"})
    }

    const users = await User.find({
      state: state,
      city: city,
    }).select("-password")
    res.status(200).json({message:"User fetched Successfully",users})
  }
  catch (error){
    res.status(500).json({message:"SERVER ERROR",error:error.message})

  }
}

const getUserById=async (req,res)=>{
  try{
    const {id}=req.params;
    const user=await User.findById(id).select("-password");

    if(!user){
      return res.status(400).json({message:"USER NOT FOUND"})
    }

    res.status(200).json({message:"USER FOUND",user})
  }
  catch(error){
    res.status(500).json({message:"SERVER ERROR",error:error.message})
  }
}

const updateUserById= async (req,res)=>{
  try{
    const {id}=req.params;

    if (req.userId.toString() !== id) {
      return res.status(403).json({
        message: "You can only update your own account"
      });
    }

    const updatedata=req.body;

    const user=await User.findByIdAndUpdate(id,updatedata,{new:true,runValidators:true}).select("-password");

    if(!user){
      return res.status(400).json({message:"USER NOT EXIST"})
    }
    
    res.status(200).json({message:"USER DETAILS UPDATED SUCCESSFULLY",user})
  }
  catch(error){
        res.status(500).json({message:"SERVER ERROR",error:error.message})
  }
}

const deleteUserById = async (req,res)=>{
  try{
    const {id}= req.params;

     if (req.userId.toString() !== id) {
      return res.status(403).json({
        message: "You can only delete your own account"
      });
    }
    
    const user= await User.findByIdAndDelete(id)

    if(!user){
      return res.status(404).json({message:"USER NOT EXIST"})
    }

    res.status(200).json({message:"USER DELETED SUCCESSFULLY",user})
  }
  catch(error){
    res.status(500).json({message:"SERVER ERROR",error:error.message})
  }
}

const signup= async (req,res)=>{
  try{
    const {email,phone,name,city,state,age,password}=req.body;
    const user= await User.findOne({email})

    if(user){
      return res.status(400).json({message:`${name} IS ALREADY EXIST`})
    }
    const hashedpassword= await bcrypt.hash(password,10)
    const newUser= await User.create({name,email,age,city,phone,state,password:hashedpassword})
    const { password: _, ...userdata } = newUser.toObject();
    return res.status(200).json({message:"USER CREATED SUCCESSFULLY",user:userdata})
  }
  catch(error){
    res.status(500).json({message:"SERVER ERROR",error:error.message})
  }
}

const login= async (req,res)=>{
  try{
    const {email,password}=req.body;
    
    const user = await User.findOne({email})

    if(!user){
      return res.status(400).json({message:"USER NOT FOUND"})
    }

    const match=await bcrypt.compare(password,user.password)

    if(!match){
      return res.status(401).json({message:"INVALID EMAIL OR PASSWORD"})
    }
    const token = jwt.sign({userId:user._id},process.env.SECRET_KEY,{expiresIn:"1d"})
    const { password: _, ...userdata } = user.toObject();
    res.status(200).json({message:"LOGIN SUCCESSFULLY",token,user:userdata})
    
  }
  catch(error){
    res.status(500).json({message:"SERVER ERROR",error:error.message})
  }
}
module.exports={getUserByLocation,getUserById,login,updateUserById,signup, deleteUserById}