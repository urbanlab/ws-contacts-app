
// UUID
//
var uuid = Cookies.get('userid') || Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
Cookies.set('userid', uuid)
$('#userid').val(uuid)
console.log(uuid)

// Socket.io
//
var socket = io();
socket.on('hello', function() {
  socket.emit('hi', uuid);
});

socket.on('nickname', function(nick) {
    if (!nick) return
    $('#nick').val(nick)
    $('#nick').attr('disabled', 'disabled')    
})

socket.on('generate', function(requests) {

    // not array return
    if (!requests) return

    var showNew = true
    var showDone = true
    
    for (var req of requests) 
    {
        if (req.status === "done") 
        {
            $('<img>').attr('src', '/'+req.selfie.path).appendTo('#done')
        } 
        else if (req.status === "pending") 
        {
            $('#generate').show()
            $('#reqid').html(req.uuid)
            showNew = false
            showDone = false
        }
    }

    if (showNew) $('#new').show()
    if (showDone) $('#done').show()
})

socket.on('reload', function() {
    location.reload()
})


// Retry Generate
$('#reqid').click(function() {
    console.log('retry', this.innerHTML)
    socket.emit('retry', this.innerHTML)
})


