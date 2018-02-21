const Koa = require('koa')
const Router = require('koa-trie-router')
const http = require('http')
const socket = require('socket.io')
const Redis = require('ioredis');

const config = {
  host: process.env.HOST || '127.0.0.1',
  port: process.env.PORT || 5000,
  redis: process.env.REDIS || 'redis://127.0.0.1:6379'
}

///////////////////////////////////////////////////////
// Initialize
///////////////////////////////////////////////////////

const app = new Koa()
const router = new Router()
const server = http.createServer(app.callback())
const io = new socket(server)
const sub = new Redis(config.redis);
const pub = new Redis(config.redis);

///////////////////////////////////////////////////////
// Socket
///////////////////////////////////////////////////////

io.sockets.on('connection', (socket) => {
  console.log('a user connected')
  socket.on('disconnect', () => {
    console.log('user disconnected')
  })
})

///////////////////////////////////////////////////////
// Redis
///////////////////////////////////////////////////////

sub.psubscribe('*');
sub.on('pmessage', (pattern, channel, message) => {
  io.emit(channel, JSON.parse(message));
});

///////////////////////////////////////////////////////
// Routes
///////////////////////////////////////////////////////

const get = async(ctx, next) => {
  await next()

  pub.publish('test', JSON.stringify({ "name": "YOLO" }))

  ctx.type = 'json'
  ctx.body = {
    message: 'Hello home sample!'
  }
}

const post = async(ctx, next) => {
  await next()

  pub.publish('test', JSON.stringify({ "name": "YOLO" }))

  ctx.type = 'json'
  ctx.body = {
    message: 'Hello home sample!'
  }
}

router
  .get('/', get)
  .post('/', post)

app.use(router.middleware())

///////////////////////////////////////////////////////
// Server
///////////////////////////////////////////////////////

server.listen(config.port)