const jwt =require("jsonwebtoken")
require("dotenv").config()

const authmiddleware=(req,res,next)=>{
  try{
    const authHeader=req.headers.authorization

    if(!authHeader || !authHeader.startsWith("Bearer ")){
      return res.status(400).json({message:"TOKEN MISSING"})
    }

    const token = authHeader.split(" ")[1];

    const decode = jwt.verify(token,process.env.SECRET_KEY)

    req.userId=decode.userId;

    next();
  }
  catch(error){
    return res.status(401).json({message:"Invalid or expired Token"})
  }
}

module.exports=authmiddleware