const Koa = require('koa')
const Router = require('koa-trie-router')
const bodyParser = require('koa-bodyparser');
const http = require('http')
const socket = require('socket.io')
const Redis = require('ioredis');
const sjcl = require('sjcl');

const config = {
  env: process.env.NODE_ENV || "production",
  host: process.env.HOST || '127.0.0.1',
  port: process.env.PORT || 5000,
  redis: process.env.REDIS || 'redis://127.0.0.1:6379',
  secret: process.env.SECRET || "foo",
  salt: process.env.SALT || "p1fxqb8xujm6JFo7"
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
// Authentication setup
///////////////////////////////////////////////////////

function authenticate(socket, data, callback) {
  const username = data.username;
  const key = data.key;
  const encryptKey = username + "-" + config.salt;

  const bitArray = sjcl.hash.sha256.hash(encryptKey);
  const result   = sjcl.codec.hex.fromBits(bitArray);

  if (result !== key) {
    return callback(new Error("User not authenticated"));
  } else {
    return callback(null, true);
  }
}

require('socketio-auth')(io, {
  authenticate: authenticate,
  timeout: 1000
});

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

app.use(router.middleware())

///////////////////////////////////////////////////////
// Server
///////////////////////////////////////////////////////

server.listen(config.port)
