const Message=require("../model/message")
const Request=require("../model/request")
const User=require("../model/user")
const { getIO, onlineUsers } = require("../config/socket");

const sendMessage= async (req,res)=>{
  try{
    const sender=req.userId;
    const {receiver,message}=req.body;
    if(!receiver||!message){
      return res.status(400).json({message:"Reciver and essage are required"})
    }
    if(sender.toString() === receiver.toString()){
      return res.status(400).json({message:"YOU CANNOT SEND MESSAGE TO YOURSELF"})
    }

    const receiverUser=await User.findById(receiver)
    if(!receiverUser){
      return res.status(404).json({message:"RECEIVER NOT FOUND"})
    }

    const acceptRequest= await Request.findOne({
      status:"accepted",
      $or:[
        {sender:sender, receiver:receiver},
        {sender:receiver, receiver:sender}
      ]
    })

    if(!acceptRequest){
      return res.status(403).json({message:"Chat is allowed only when request is accepted"})
    }

    const newMessage=await Message.create({
      sender,receiver,message
    })
    const io = getIO();
    const receiverSockets = onlineUsers.get(receiver.toString());

    if (receiverSockets) {
      receiverSockets.forEach((socketId) => {
        io.to(socketId).emit("receiveMessage", newMessage);
      });
    }
    return res.status(200).json({message:"Message sent Successfully",data:newMessage})
  }
  catch(error){
    return res.status(500).json({
      message: "SERVER ERROR",
      error: error.message
    });
  }
}

const getMessages = async (req, res) => {
  try {
    const sender = req.userId;
    const { userId } = req.params;

    const acceptedRequest = await Request.findOne({
      status: "accepted",
      $or: [
        { sender: sender, receiver: userId },
        { sender: userId, receiver: sender }
      ]
    });

    if (!acceptedRequest) {
      return res.status(403).json({
        message: "Chat access denied"
      });
    }

    const messages = await Message.find({
      $or: [
        { sender: sender, receiver: userId },
        { sender: userId, receiver: sender }
      ]
    }).sort({ createdAt: 1 });

    return res.status(200).json({
      message: "Messages fetched successfully",
      messages
    });

  } catch (error) {
    return res.status(500).json({
      message: "SERVER ERROR",
      error: error.message
    });
  }
};

module.exports = { sendMessage, getMessages };
