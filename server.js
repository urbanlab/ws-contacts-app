import express from 'express';
import { Server as HttpServer } from 'http';
import { Server as IoServer } from "socket.io";
import fs from 'fs';
import { JSONFilePreset } from 'lowdb/node'
import _        from 'lodash'
import fetch from 'node-fetch';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

// Global variables
const COG_API_URL = process.env.COG_API_URL || 'http://localhost:5000'
const BACKEND_PORT = process.env.BACKEND_PORT || 4000
const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || 'http://localhost:4000'


const upload_folder = "https://localhost:4000" // https://contacts.kxkm.net

// Path
import path from 'path'
import {fileURLToPath} from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database
const defaultData = { users: [ {nick: "Rasta1"} ], requests: []}
const db = await JSONFilePreset('database.json', defaultData)

// Servers
var app = express();
var server = HttpServer(app);
var io = new IoServer(server);


// Request AI
//
var requestAI = async function(reqid) {
    var request = db.data.requests.find((req) => req.uuid === reqid)
    if (request) {
        var raw = JSON.stringify(request.input)

        // Call POST request to API
        console.log(raw)
        const myHeaders = new Headers();
        myHeaders.append("Content-Type", "application/json");
        const response = await fetch(`${COG_API_URL}/predictions`, {method: 'POST', headers: myHeaders, body: raw, redirect: "follow"})
        const data = await response.json();
        return data
    }
    throw new Error('Request not found');
}
    

// Socket.io 
//
io.on('connection', (socket) => 
{
  console.log('a user connected')

  socket.on('disconnect', () => {
    console.log('user disconnected')
  })

  // Client is ready, tell him what to do
  socket.on('hi', (userid) => 
  {
    // join userid room
    socket.join(userid)

    // check if nickname is set
    var user = db.data.users.find((user) => user.userid === userid) 
    if (user) socket.emit('nickname', user.nick)

    // check if a request is pending
    var request = db.data.requests.filter((req) => req.userid === userid)
    if (request) socket.emit('generate', request)
  })

  // Get all outputs
  socket.on('outputs', () => {
    var outputs = fs.readdirSync('outputs')
    for (var i=0; i<outputs.length; i++) {
      socket.emit('output', "outputs/"+outputs[i])
    }
  })
  
  // Send initial HELLO trigger
  socket.emit('hello');

});


// Express Server
//

server.listen(BACKEND_PORT, function() {
  console.log(`listening on *:${BACKEND_PORT}`);
});

app.use(express.json({limit: '50mb'}));


app.post('/gen', function(req, res) {

  // Get JSON
  var data = req.body;
  console.log("=========== /gen REQUEST  =========");
  console.log(data);      // your JSON

  // Save nick if not exists for uuid
  var user = db.data.users.find((user) => user.userid === data.userid)
  if (!user) {
      db.data.users.push({userid: data.userid, nick: data.nick})
      db.write()
      console.log('==== new user nickname saved', data.userid)
  }

  // extract selfie base64 and save to uploads/
  var selfie = data.selfie;
  var selfieData = selfie.replace(/^data:image\/\w+;base64,/, "");
  var buf = Buffer.from(selfieData, 'base64');
  var filename = 'uploads/'+data.userid+'_'+Date.now()+'.jpg';
  fs.writeFileSync(filename, buf);
  data.selfie = filename;

  // select model image and prompt
  // TODO: get modelname from user inputs
  var modelname = 'PIG_00012_'

  // get prompt from modelname.txt
  // if file does not exists, create it
  if (!fs.existsSync('models/'+modelname+'.txt'))
    fs.writeFileSync('models/'+modelname+'.txt', 'a person')
  var prompt = fs.readFileSync('models/'+modelname+'.txt', 'utf8');

  // New AI request
  var reqid = 'req_'+Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  var inreq = {
    "input": {
      "image": BACKEND_BASE_URL+"/"+filename,
      "image_to_become": BACKEND_BASE_URL+"/models/"+modelname+".png",
      "prompt": prompt,
      "negative_prompt": "",
      "number_of_images": 1,
      "denoising_strength": 1,
      "prompt_strength": 0.8,
      "control_depth_strength": 0.3,
      "instant_id_strength": 0.5,
      "image_to_become_strength": 0.8,
      "image_to_become_noise": 0.53,
      "seed": 9,  // 194246477, // crypto.randomBytes(4).readUInt32BE(0, true)
      "disable_safety_checker": true
    }
  }
  console.log(inreq)
  var request = {uuid: reqid, userid: data.userid, data: data, input: inreq, output: [], status: "pending"};

  // Save the request to DB
  db.data.requests.push(request)
  db.write()

  // Query AI
  console.log('=== request AI', reqid)
  requestAI(reqid).then((res) => 
  {
      console.log('=== request processed', reqid)
      console.log(res)

      // pick the request
      var request = db.data.requests.find((req) => req.uuid === reqid)

      // detect error
      if (res.error || !res.output) {
        console.log('\tERROR: No output')
        console.log('\t', res.error)
        request.status = "error"
        db.write()
        io.to(request.userid).emit('error', request, res)
        return
      }

      var request = db.data.requests.find((req) => req.uuid === reqid)

      // Save base64 result to outputs/
      for (var i=0; i<res.output.length; i++) {
        var out = res.output[i];
        var outData = out.replace(/^data:image\/\w+;base64,/, "");
        var buf = Buffer.from(outData, 'base64');
        var filename = 'outputs/'+reqid+'_'+i+'.jpg';
        fs.writeFileSync(filename, buf);
        request.output.push(filename);
      }

      request.status = "done"
      db.write()
      console.log('done', reqid)
      io.to(request.userid).emit('done', request)
      for (var i=0; i<request.output.length; i++) {
        io.emit('output', request.output[i])
      }
  })

  // Echo request 
  res.send(request);
});

app.get('/totem', function(req, res) {
  res.sendFile(__dirname + '/www/totem.html');
});

app.get('/', function(req, res) {
  res.sendFile(__dirname + '/www/app.html');
});

// Serve static files /static
// app.use('/static', express.static('www'));
app.use('/static', express.static('www'));
app.use('/uploads', express.static('uploads'));
app.use('/models', express.static('models'));
app.use('/outputs', express.static('outputs'));