var imagesList = []

// Socket.io
//
var socket = io();

socket.on('hello', function() {
    socket.emit('outputs')
});

socket.on('output', function(output) {
    console.log('output', output)
    if (output.indexOf('.jpg') === -1) return
    var img = $('<img>').attr('src', output).appendTo('#mainapp').hide()
    imagesList.push(img)
})

// rotate image visibility every 5 seconds
var i = 0
setInterval(function() {
    if (imagesList.length === 0) return
    for (var j=0; j<imagesList.length; j++) {
        imagesList[j].hide()
    }
    i = (i+1)
    imagesList[i % imagesList.length].show()
    console.log('show', imagesList[i % imagesList.length].attr('src'))
}, 1000)