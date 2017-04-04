var watch = require('recursive-watch')
var createReadStream = require('fd-read-stream')
var fs = require('fs')
var path = require('path')
var events = require('events')

module.exports = mirror

function mirror (src, dst, opts, cb) {
  if (typeof opts === 'function') return mirror(src, dst, null, opts)
  if (!opts) opts = {}

  var progress = new events.EventEmitter()

  if (cb) {
    progress.on('error', cb)
    progress.on('end', cb)
  }

  src = parse(src)
  dst = parse(dst)

  var waiting = true
  var walking = [src.name]
  var pending = []
  var equals = opts.equals || defaultEquals

  if (opts.live) watch(src.name, onwatch)
  walk()

  return progress

  function onwatch (name) {
    update(name, true)
  }

  function update (name, live) {
    if (name === src.name) pending.push({name: '', live: live}) // allow single file src
    else pending.push({name: name.slice(src.name.length) || path.sep, live: live})
    if (pending.length === 1) kick()
  }

  function stat (fs, name, cb) {
    if (opts.dereference) fs.stat(name, cb)
    else fs.lstat(name, cb)
  }

  function kick () {
    var name = pending[0].name
    var live = pending[0].live

    var a = {name: path.join(src.name, name), stat: null, live: live, fs: src.fs}
    var b = {name: path.join(dst.name, name), stat: null, live: live, fs: dst.fs}

    stat(a.fs, a.name, function (_, st) {
      if (st) a.stat = st
      stat(b.fs, b.name, function (_, st) {
        if (st) b.stat = st

        // skip, not in any folder
        if (!a.stat && !b.stat) return next()

        // ignore
        if (opts.ignore && (opts.ignore(a.name, a.stat) || opts.ignore(b.name, b.stat))) return next()

        // del from b
        if (!a.stat && b.stat) return del(b, next)

        // copy to b
        if (a.stat && !b.stat) return put(a, b, next)

        // check if they are the same
        equals(a, b, function (err, same) {
          if (err) throw err
          if (same) return next()
          put(a, b, next)
        })
      })
    })
  }

  function next (err) {
    if (err) return progress.emit('error', err)

    pending.shift()
    if (pending.length) return kick()

    if (!opts.live && !walking.length && waiting) return progress.emit('end')
    walk()
  }

  function walk () {
    if (!walking.length || !waiting) return

    var name = walking.pop()
    waiting = false

    src.fs.lstat(name, function (err, st) {
      if (err && err.code === 'ENOENT') return walk()
      if (err) return progress.emit('error', err)

      if (!st.isDirectory()) {
        waiting = true
        update(name, false)
        return
      }

      src.fs.readdir(name, function (err, names) {
        if (err && err.code === 'ENOENT') return walk()
        if (err) return progress.emit('error', err)

        names = names.sort().reverse()
        for (var i = 0; i < names.length; i++) walking.push(path.join(name, names[i]))

        waiting = true
        update(name, false)
      })
    })
  }

  function del (b, cb) {
    progress.emit('del', b)
    if (!b.stat.isDirectory()) return b.fs.unlink(b.name, cb)
    rimraf(b, function () { // ignore errors for now
      cb()
    })
  }

  function rimraf (b, cb) { // this one is a bit hacky ...
    b.fs.readdir(b.name, function (_, list) {
      if (!list) list = []
      loop()

      function loop () {
        if (!list.length) {
          if (b.stat.isDirectory()) b.fs.rmdir(b.name, cb)
          else b.fs.unlink(b.name, cb)
          return
        }

        var name = path.join(b.name, list.shift())

        b.fs.lstat(name, function (err, st) {
          if (err) return cb()
          rimraf({name: name, stat: st, fs: b.fs}, loop)
        })
      }
    })
  }

  function put (a, b, cb) {
    progress.emit('put', a, b)
    if (a.stat.isDirectory()) return b.fs.mkdir(b.name, a.stat.mode, ignoreError(cb))

    if (a.live && a.fs.open) {
      // To work around the race condition that files might be written *in progress*
      // when live watching we use the fd retry 50ms option.
      a.fs.open(a.name, 'r', function (err, fd) {
        if (err) return cb(err)
        copy(createReadStream(fd, {retry: 50}))
      })
    } else {
      copy(a.fs.createReadStream(a.name))
    }

    function copy (rs) {
      var ws = b.fs.createWriteStream(b.name, {mode: a.stat.mode})

      rs.on('error', onerror)
      ws.on('error', onerror)
      ws.on('finish', onfinish)

      rs.pipe(ws)
      rs.on('data', ondata)

      function ondata (data) {
        progress.emit('put-data', data, a, b)
      }

      function onfinish () {
        progress.emit('put-end', a, b)
        cb()
      }

      function onerror (err) {
        progress.emit('put-error', a, b)
        rs.destroy()
        ws.destroy()
        ws.removeListener('finish', cb)
        cb(err)
      }
    }
  }

  function ignoreError (cb) {
    return function (err) {
      if (err && err.code !== 'EEXIST') return cb(err)
      cb(null)
    }
  }
}

function parse (name) {
  if (typeof name === 'string') return {name: path.resolve(name), fs: fs}
  name.name = path.resolve(name.name)
  if (!name.fs) name.fs = fs
  return name
}

function defaultEquals (a, b, cb) {
  if (!a.stat.isDirectory() && (a.stat.size !== b.stat.size)) return cb(null, false)
  if (a.stat.mtime.getTime() > b.stat.mtime.getTime()) return cb(null, false)
  cb(null, true)
}
