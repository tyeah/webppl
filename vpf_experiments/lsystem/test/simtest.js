var fs = require('fs');
var Canvas = require('canvas');
var lsysutils = require('../utils');

var w = 50;
var h = 50;
var totalNumPixels = w*h;

var canvas1 = new Canvas(w, h);
var canvas2 = new Canvas(w, h);
var ctx1 = canvas1.getContext('2d');
var ctx2 = canvas2.getContext('2d');

// // Full white for canvas1
// ctx1.fillStyle = 'white';
// ctx1.fillRect(0, 0, w, h);

// // Half white, half black for canvas2
// ctx2.fillStyle = 'white';
// ctx2.fillRect(0, 0, w, h);
// ctx2.fillStyle = 'black';
// var x = 12;
// var y = 12;
// ctx2.fillRect(x, y, w/2, h/2);

// Rendered image for canvas1
// var img = lsysutils.newImageData2D().loadFromFile(__dirname + '/img1.png');
var img = lsysutils.newImageData2D().loadFromFile(__dirname + '/img2.png');
img.copyToCanvas(canvas1);

// Target image for canvas2
var tgtimg = lsysutils.newImageData2D().loadFromFile(__dirname + '/../targets/curl_50.png');
tgtimg.copyToCanvas(canvas2);

fs.writeFileSync(__dirname + '/canvas1.png', canvas1.toBuffer());
fs.writeFileSync(__dirname + '/canvas2.png', canvas2.toBuffer());

var dat1 = lsysutils.newImageData2D().loadFromCanvas(canvas1);
var dat2 = lsysutils.newImageData2D().loadFromCanvas(canvas2);

console.log('---------------');
console.log('total # pixels: ' + totalNumPixels);
console.log('num same computed: ' + dat1.numSameBinary(dat2));
// console.log('num same true: ' + totalNumPixels*(3/4));
console.log('percent same computed: ' + dat1.percentSameBinary(dat2));