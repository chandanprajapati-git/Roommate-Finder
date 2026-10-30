const {Schema,model}=require("mongoose")

const messageSchema= new Schema({
  sender:{
    type:Schema.Types.ObjectId,
    ref:"User",
    required:true
  },
  receiver:{
    type:Schema.Types.ObjectId,
    ref:"User",
    required:true
  },
  message:{
    type:String,
    required:true,
    trim:true
  },
  status:{
    type:String,
    enum:["sent","delivered","read"],
    default:"sent"
  }
},{
  timestamps:true
})

module.exports=model("Message",messageSchema)