// Polyfill the removed util.isNullOrUndefined (Node 23+ broke tfjs-node < ~4.23)
let util = require('util')

// Only patch if the function is missing
if (typeof util.isNullOrUndefined !== 'function') {
  util.isNullOrUndefined = (val: any) => val === null || val === undefined
}

// Optional: also patch isUndefined / isDefined if you see similar errors later
if (typeof util.isUndefined !== 'function') {
  util.isUndefined = (val: any) => val === undefined
}

if (typeof util.isDefined !== 'function') {
  util.isDefined = (val: any) => val !== undefined
}

if (typeof util.isArray !== 'function') {
  util.isArray = (val: any): boolean => {
    return Array.isArray(val)
  }
}
