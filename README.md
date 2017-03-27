# mirror-folder

Small module to mirror a folder to another folder.

Supports live mode as well where it will contintously watch the src folder and mirror new entries as they are created/removed.

```
npm install mirror-folder
```

## Usage

``` js
var mirror = require('mirror-folder')

mirror('/Users/maf/cool-stuff', '/Users/maf/cool-stuff-mirror', function (err) {
  if (err) throw err
  console.log('Folder was mirrored')
})
```

## API

#### `var progress = mirror(src, dst, [options], [callback])`

Mirror `src` to `dst`. Returns a progress event emitter.

Options include:

``` js
{
  live: false, // keep watching the src and mirror new entries,
  dereference: false, // dereference any symlinks
  equals: fun // optional function to determine if two entries are the same, see below
  ignore: null // optional function to ignore file paths on src or dest
}
```

The equals function looks like this:

``` js
function equals (src, dst, cb) {
  console.log('src.name', src.name)
  console.log('src.stat', src.stat)
  console.log('dst.name', dst.name)
  console.log('dst.stat', dst.stat)
  cb(null, true) // callback with true if they are the same or false if not
}
```

Per default the equals function will check if mtime is larger on the src entry or if the size is different

The ignore function looks like this:

``` js
function ignore (file) {
  // ignore any files with secret in them
  if (file.indexOf('secret') > -1) return true
  return false
}
```

If you are using a custom fs module (like [graceful-fs](https://github.com/isaacs/node-graceful-fs)) you can pass that in
with the `src` or `dst` like this:

``` js
mirror({name: '/Users/maf/cool-stuff', fs: customFs}, {name: '/Users/maf/cool-stuff-mirror', fs: anotherFs})
```

#### `progress.on('put', src, dst)`

Emitted when a file/folder is copied from the src to the dst folder.

#### `progress.on('put-data', data)`

Emitted when a file chunk is read from the src.

#### `progress.on('del', dst)`

Emitted when a file/folder is deleted from the dst folder.

#### `progress.on('end')`

Emitted when the mirror ends (not emitted in live mode). The mirror callback is called when this event is emitted as well

#### `progress.on('error', err)`

Emitted when a critical error happens. If you pass a mirror callback you don't need to listen for this.

## License

MIT
