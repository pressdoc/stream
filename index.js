const Koa = require('koa')
const Router = require('koa-trie-router')
const bodyParser = require('koa-bodyparser');
const auth = require('koa-basic-auth');
const http = require('http')
const socket = require('socket.io')
const Redis = require('ioredis');

const config = {
  env: process.env.NODE_ENV || "production",
  host: process.env.HOST || '127.0.0.1',
  port: process.env.PORT || 5000,
  redis: process.env.REDIS || 'redis://127.0.0.1:6379',
  client_key: process.env.CLIENT_KEY || "key",
  client_secret: process.env.CLIENT_SECRET || "secret"
}
const prefix = `stream:${config.env}`

///////////////////////////////////////////////////////
// Initialize
///////////////////////////////////////////////////////

const app = new Koa()
const router = new Router()
const server = http.createServer(app.callback())
const io = new socket(server)

const sub = new Redis(config.redis);
const pub = sub.duplicate();

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

sub.psubscribe(`${prefix}:*`);
sub.on('pmessage', (pattern, channel, message) => {
  const c = channel.replace(`${prefix}:`, "")
  io.emit(c, JSON.parse(message));
});

///////////////////////////////////////////////////////
// Routes
///////////////////////////////////////////////////////

const get = async(ctx, next) => {
  await next()

  ctx.body = {
    ok: true,
    name: "pr.co Websocket Server",
    status: 200,
    env: config.env,
    redis: {
      pub: pub.status,
      sub: sub.status
    }
  }
}

const post = async(ctx, next) => {
  await next()

  const body = ctx.request.body
  if (Object.keys(body).length === 0) {
    return ctx.throw(422, "Message could not be added. Empty request body");
  }

  const { channel, params={} } = body
  if (!channel || channel.length == 0) {
    return ctx.throw(422, "Message could not be added. No `channel` in request body");
  }

  pub.publish(`${prefix}:${channel}`, JSON.stringify(params))

  ctx.type = 'json'
  ctx.body = {
    message: "Message added"
  }
}

router
  .get('/', get)
  .post('/', post)

app.use(bodyParser());

app.use(async (ctx, next) => {
  await next();
  ctx.type = 'json';
});

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    ctx.status = err.statusCode || err.status || 500;
    ctx.body = {
      message: err.message
    };
  }
})

app.use(auth({ name: config.client_key, pass: config.client_secret }));
app.use(router.middleware())

///////////////////////////////////////////////////////
// Server
///////////////////////////////////////////////////////

server.listen(config.port)