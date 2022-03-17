const socketIO = require('socket.io')
const http = require('http')
const crypto = require('crypto')
const server = http.createServer()
const io = socketIO(server)
const fs = require('fs')

const port = 3000
const clients = []
const algorithm = 'aes-256-cbc'
const sercretKey = 'secretkey'
const tempFilePath = './data/temp.txt'
 
io.on('connection', (socket) => {
    console.log('Establishing connection...')
    socket.on('connectionEvent', (clientId) => {
        clientConnectedHandler(clientId, socket)
    })
    console.log('Connection established')
})

const clientConnectedHandler = (clientId, socket) => {
    console.log('Client ' + clientId + ' connected. Registering client...')
    // TODO check is client already exits
    const client = clients.find((client) => client.clientId === clientId)
    if (client) {
        client.socket = socket
    }
    else {
        clients.push({ clientId, socket })
    }
    console.log('Client registered')
    socket.on('clientEvent', clientEventHandler)
}

const clientEventHandler = (data) => {
    console.log('A message to be forwarded to ' + data.client + ' recieved')
    const client = clients.find((client) => client.clientId === data.client)
    if (client) {
        if (data.streamMessage) {
            forwardStream(client, data)
        } else {
            forwardMessage(client, data)
        }
    }
}

const forwardStream = (client, data) => {
    console.log('Stream message requested from ' + data.sender + ' to ' + data.client)
    const sender = clients.find((client) => client.clientId === data.sender)
    console.log('Clearing file ' + tempFilePath + '...')
    fs.writeFileSync(tempFilePath, '')
    const ws = fs.createWriteStream(tempFilePath)
    sender.socket.on('clientStreamEvent', (chuck) => {
        let decryptedChunk = decrypt(chuck)
        ws.write(decryptedChunk, 'utf-8', (err) => {
            if (err) {
                console.log(err.message)
            }
        })
    })
    sender.socket.on('clientStreamEndEvent', () => {
        console.log('Streaming from client ' + data.sender + ' completed')
        ws.close()
        client.socket.on('ackClientEvent', () => {
            console.log('Streaming allowed by client')
            console.log('Starting stream to client ' + data.client)
            const rs = fs.createReadStream(tempFilePath, 'utf-8')
            rs.on('data', (chunk) => {
                client.socket.emit('serverStreamEvent', encrypt(chunk) + '::VERIFIED')
            })
            rs.on('end', () => {
                console.log('Streaming of message completed')
                client.socket.emit('serverStreamEndEvent')
                // TODO delete temp files
            })
        })
        console.log('Requesting client ' + data.client + ' to allow streaming')
        client.socket.emit('serverEvent', data)
        // Acknowledge and allow streaming
    })
    console.log('Allowing streaming...')
    sender.socket.emit('ackServerEvent')
}

const forwardMessage = (client, data) => {
    console.log('Message recieved from ' + data.sender + ' to ' + data.client + '. Decrypting...')
    const decryptedMessage = decrypt(data.message)
    data.message += '::VERIFIED'
    console.log('Message being forwarded to client ', data.client)
    client.socket.emit('serverEvent', data)
    console.log('Message sent to client ', data.client)
}

const encrypt = (data) => {
    var cipher = crypto.createCipher(algorithm, sercretKey)
    var encryptedData = cipher.update(data, 'utf8', 'hex')
    encryptedData += cipher.final('hex')
    return encryptedData
}

const decrypt = (data) => {
    const decipher = crypto.createDecipher(algorithm, sercretKey)
    let decryptedData = decipher.update(data, 'hex', 'utf8')
    decryptedData += decipher.final('utf8')
    return decryptedData
}

server.listen(port)
console.log('Server started: http://localhost:' + port)