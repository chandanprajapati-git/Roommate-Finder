const {model,Schema}=require("mongoose")


const userSchema=new Schema({
  name:{
    type:String,
    required:true,
    trim:true,
  },
  email:{
    type:String,
    required:true,
    trim:true,
    unique:true
  },
  phone:{
    type:String,
    required:true,
    trim:true,
  },
  state:{
    type:String,
    required:true,
    trim:true,
  },
  city:{
    type:String,
    required:true,
    trim:true,
  },
  age:{
    type:Number,
    required:true,
  },
  password:{
    type:String,
    required:true,
    trim:true,
  }
},
{
  timestamps:true
})

module.exports= model("User",userSchema)