import express from 'express';
import { Server as HttpServer } from 'http';
import { Server as IoServer } from "socket.io";
import multer from 'multer';
import fs from 'fs';
import { JSONFilePreset } from 'lowdb/node'
import _        from 'lodash'
import fetch from 'node-fetch';

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

// Storage
var storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '.jpg') //Appending .jpg
    }
})
var upload = multer({ storage: storage })


// Request AI
//
var requestAI = async function(reqid) {
    var request = db.data.requests.find((req) => req.uuid === reqid)
    if (request) {
        var reqdata = {input: {a: 1}}

        // Call POST request to API
        const response = await fetch('https://httpbin.org/post', {method: 'POST', body: JSON.stringify(reqdata) });
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
    // check if nickname is set
    var user = db.data.users.find((user) => user.userid === userid) 
    if (user) socket.emit('nickname', user.nick)

    // check if a request is pending
    var request = db.data.requests.filter((req) => req.userid === userid)
    if (request) socket.emit('generate', request)
  })

  socket.on('retry', (reqid) => {
    console.log('retry', reqid)
    var request = db.data.requests.find((req) => req.uuid === reqid)
    requestAI(reqid).then((res) => 
    {
        console.log('request processed', res)
        request.status = "done"
        db.write()
        console.log('done', reqid)
        socket.emit('reload')
    })

  })
  
  // Send initial HELLO trigger
  socket.emit('hello');

});


// Express Server
//

server.listen(4000, function() {
  console.log('listening on *:4000');
});

app.post('/generate',  upload.single('selfie'), function(req, res) {

    // Get the data
    var data = req.body;
    var selfie = req.file;

    // Save nick if not exists for uuid
    var user = db.data.users.find((user) => user.userid === data.userid)
    if (!user) {
        db.data.users.push({userid: data.userid, nick: data.nick})
        db.write()
    }

    // New request
    var uuid = 'req_'+Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    var request = {uuid: uuid, userid: data.userid, data: data, selfie: selfie, status: "pending"};

    // Save the request
    db.data.requests.push(request)
    db.write()

    // res.sendFile(__dirname + '/www/app.html');
    res.redirect('/');
});

app.get('/totem', function(req, res) {
  res.sendFile(__dirname + '/www/totem.html');
});

app.get('/', function(req, res) {
  res.sendFile(__dirname + '/www/app.html');
});


// Serve static files /static
app.use('/static', express.static('www'));
app.use('/uploads', express.static('uploads'));

