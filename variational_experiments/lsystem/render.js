// NOTE: throughout this file, the context 'gl' is passed to functions.
//    However, we assume that these functions only ever see one such
//    context during the lifetime of the program.

if (typeof(window) === 'undefined') {
	var THREE = require('three');
}

var render = {};

(function() {

var client = (typeof(window) === 'undefined') ? 'node' : 'browser';

var ROOT = '';
render.setRootDir = function(dir) { ROOT = dir; }


// ----------------------------------------------------------------------------
// Loading / compiling shaders


function compileShader ( gl, type, src ){
   var shader;
   if (type == "fragment")
           shader = gl.createShader ( gl.FRAGMENT_SHADER );
   else if (type == "vertex")
           shader = gl.createShader(gl.VERTEX_SHADER);
   else return null;
   gl.shaderSource(shader, src);
   gl.compileShader(shader);
   if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) == 0)
      console.log(type + "\n" + gl.getShaderInfoLog(shader));
   return shader;
}

function compileProgram(gl, vertSrc, fragSrc) {
	var prog  = gl.createProgram();
	var vertShader = compileShader(gl, 'vertex', vertSrc);
	var fragShader = compileShader(gl, 'fragment', fragSrc);
	gl.attachShader(prog, vertShader);
	gl.attachShader(prog, fragShader);
	gl.linkProgram(prog);
	return prog;
}

function loadTextFile_node(filename, async, callback) {
	var fs = require('fs');
	if (async) {
		fs.readFile(filename, function(err, data) {
			callback(data.toString());
		});
	} else {
		var text = fs.readFileSync(filename).toString();
		callback(text); 
	}
}
function loadTextFile_browser(filename, async, callback) {
	$.ajax({
		async: async,
		dataType: 'text',
	    url: filename,
	    success: function (data) {
	        callback(data);
	    }
	});
}
var loadTextFile = (client === 'node') ? loadTextFile_node : loadTextFile_browser;

function loadShaderProgram(gl, vertFilename, fragFilename, async, callback) {
	loadTextFile(vertFilename, async, function(vertSrc) {
		loadTextFile(fragFilename, async, function(fragSrc) {
			var prog = compileProgram(gl, vertSrc, fragSrc);
			callback(prog);
		});
	})
}

function loadImage_node(filename, async, callback) {
	assert(!async, 'Node image loads must be synchronous');
	var Canvas = require('canvas');
	var img = new Canvas.Image;
	img.src = filename;
	callback(img);
}

function loadImage_browser(filename, async, callback) {
	if (!async) {
		throw 'Browser image loads must be asynchronous';
	}
	var img = new Image;
	img.addEventListener('load', function() {
		callback(img);
	});
	img.src = filename;
}

var loadImage = (client === 'node') ? loadImage_node : loadImage_browser;

function loadTexture(gl, filename, async, callback) {
	loadImage(filename, async, function(img) {
		var texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
		gl.generateMipmap(gl.TEXTURE_2D);
		gl.bindTexture(gl.TEXTURE_2D, null);
		callback(texture);
	});
}

// TODO: Will need a bit more sophistication if an asset can be present in multiple asset lists (so as not
//    to double-load)
function ensureAssetsLoaded(gl, assets, async, callback) {

	function FULLPATH(path) {
		return ROOT + '/assets/' + path;
	}

	function loadAssets(asslist, cb) {
		var asset = asslist[0];
		var remainingAssets = asslist.slice(1);
		var k;	// continuation
		if (remainingAssets.length === 0) {
			k = callback;
		} else {
			k = function() {
				loadAssets(remainingAssets, callback);
			};
		}
		if (asset.type === 'shaderProgram') {
			loadShaderProgram(gl, FULLPATH(asset.vertShader), FULLPATH(asset.fragShader), async, function(prog) {
				asset.prog = prog;
				k();
			});
		} else if (asset.type === 'texture') {
			loadTexture(gl, FULLPATH(asset.image), async, function(texture) {
				asset.tex = texture;
				k();
			});
		} else {
			throw 'Unrecognized asset type ' + asset.type;
		}
	}

	if (assets.__loaded) {
		callback();
	} else {
		var asslist = [];
		for (var prop in assets) asslist.push(assets[prop]);
		loadAssets(asslist, function() {
			assets.__loaded = true;
			callback();
		});
	}
}


// ----------------------------------------------------------------------------
// Mesh class


function Mesh() {
	this.vertices = [];
	this.uvs = [];
	this.normals = [];
	this.indices = [];

	this.buffers = undefined;
};

Mesh.prototype.copy = (function() {
	function copyvecs(dst, src) {
		var n = src.length;
		for (var i = 0; i < n; i++) {
			dst.push(src[i].clone());
		}
	};
	return function(other) {
		this.indices = other.indices.slice();
		copyvecs(this.vertices, other.vertices);
		copyvecs(this.uvs, other.uvs);
		copyvecs(this.normals, other.normals);
		return this;
	};
})();

Mesh.prototype.clone = function() {
	return new Mesh().copy(this);
};

Mesh.prototype.transform = function(mat) {
	var n = this.vertices.length;
	for (var i = 0; i < n; i++) {
		this.vertices[i].applyMatrix4(mat);
	}
	if (this.normals.length > 0) {
		var nmat = new THREE.Matrix4().getInverse(mat).transpose();
		for (var i = 0; i < n; i++) {
			this.normals[i].applyMatrix4(nmat);
		}
	}
	return this;
};

Mesh.prototype.append = function(other) {
	var n = this.vertices.length;
	this.vertices = this.vertices.concat(other.vertices);
	this.uvs = this.uvs.concat(other.uvs);
	this.normals = this.normals.concat(other.normals);
	var m = other.indices.length;
	for (var i = 0; i < m; i++) {
		this.indices.push(other.indices[i] + n);
	}
	return this;
};

Mesh.prototype.recomputeBuffers = function(gl) {

	this.destroyBuffers(gl);	// get rid of existing buffers (if any)
	this.buffers = {};

	var n = this.vertices.length;

	var vertices = new Float32Array(n*3);
	for (var i = 0; i < n; i++) {
		var v = this.vertices[i];
		vertices[3*i] = v.x;
		vertices[3*i+1] = v.y;
		vertices[3*i+2] = v.z;
	}
	this.buffers.vertices = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.vertices);
	gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

	if (this.uvs.length > 0) {
		var uvs = new Float32Array(n*2);
		for (var i = 0; i < n; i++) {
			var uv = this.uvs[i];
			uvs[2*i] = uv.x;
			uvs[2*i+1] = uv.y;
		}
		this.buffers.uvs = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.uvs);
		gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
	}

	if (this.normals.length > 0) {
		var normals = new Float32Array(n*3);
		for (var i = 0; i < n; i++) {
			var nrm = this.normals[i];
			normals[3*i] = nrm.x;
			normals[3*i+1] = nrm.y;
			normals[3*i+2] = nrm.z;
		}
		this.buffers.normals = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.normals);
		gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
	}

	indices = new Uint16Array(this.indices);
	this.buffers.indices = gl.createBuffer();
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.indices);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
	this.buffers.numIndices = indices.length;
};

Mesh.prototype.destroyBuffers = function(gl) {
	if (this.buffers !== undefined) {
		gl.deleteBuffer(this.buffers.vertices);
		if (this.buffers.uvs)
			gl.deleteBuffer(this.buffers.uvs);
		if (this.buffers.normals)
			gl.deleteBuffer(this.buffers.normals);
		gl.deleteBuffer(this.buffers.indices);
		this.buffers = undefined;
	}
};

Mesh.prototype.draw = function(gl, prog) {
	if (this.buffers === undefined) {
		this.recomputeBuffers(gl);
	}

	var vertLoc = gl.getAttribLocation(prog, "inPos");
	var uvLoc = gl.getAttribLocation(prog, "inUV");
	var normLoc = gl.getAttribLocation(prog, "inNorm");

	gl.enableVertexAttribArray(vertLoc);
	gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.vertices);
	gl.vertexAttribPointer(vertLoc, 3, gl.FLOAT, false, 0, 0);

	if (uvLoc !== -1) {
		gl.enableVertexAttribArray(uvLoc);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.uvs);
		gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);
	}

	if (normLoc !== -1) {
		gl.enableVertexAttribArray(normLoc);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.normals);
		gl.vertexAttribPointer(normLoc, 3, gl.FLOAT, false, 0, 0);
	}

	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.indices);
	gl.drawElements(gl.TRIANGLES, this.buffers.numIndices, gl.UNSIGNED_SHORT, 0);

	gl.disableVertexAttribArray(vertLoc);
	if (uvLoc !== -1) {
		gl.disableVertexAttribArray(uvLoc);
	}
	if (normLoc !== -1) {
		gl.disableVertexAttribArray(normLoc);
	}
};


// ----------------------------------------------------------------------------
// Rendering lo-res proxy geometry via canvas


function renderBranch(context, branch) {
	context.beginPath();
	context.lineWidth = branch.width;
	context.moveTo(branch.start.x, branch.start.y);
	context.lineTo(branch.end.x, branch.end.y);
	context.stroke();
}

function renderLeaf(context, leaf) {
	context.save();
	context.translate(leaf.center.x, leaf.center.y);
	context.rotate(leaf.angle);
	context.scale(leaf.length, leaf.width);
	context.beginPath();
	context.arc(0, 0, 0.5, 0, Math.PI*2);
	context.fill();
	context.restore();
}

function renderGeo(context, geo) {
	switch (geo.type) {
		case 'branch':
			renderBranch(context, geo.branch); break;
		case 'leaf':
			renderLeaf(context, geo.leaf); break;
		default:
			throw 'Unrecognized geo type';
	}
}

render.renderCanvasProxy = function(canvas, viewport, geo, isIncremental, fillBackground) {
	fillBackground = fillBackground === undefined ? true : fillBackground;

	var context = canvas.getContext('2d');
	context.save();

	if (fillBackground) {
		context.rect(0, 0, canvas.width, canvas.height);
		context.fillStyle = 'white';
		context.fill();
	}

	// Draw
	context.strokeStyle = 'black';
	context.fillStyle = 'black';
	context.lineCap = 'round';
	var vwidth = viewport.xmax - viewport.xmin;
	var vheight = viewport.ymax - viewport.ymin;
	context.scale(canvas.width/vwidth, canvas.height/vheight);
	context.translate(-viewport.xmin, -viewport.ymin);
	if (isIncremental) {
		renderGeo(context, geo);
	} else {
		for (var g = geo; g; g = g.next) {
			renderGeo(context, g);
		}
	}

	context.restore();
}


// ----------------------------------------------------------------------------
// Nice-looking, hi-res OpenGL rendering


function makeBezierUniform(n) {
	function bezierEval(p0, p1, p2, p3, t) {
		var p01 = p0.clone().lerp(p1, t);
		var p12 = p1.clone().lerp(p2, t);
		var p23 = p2.clone().lerp(p3, t);
		var p012 = p01.lerp(p12, t);
		var p123 = p12.lerp(p23, t);
		var p = p012.clone().lerp(p123, t);
		var tan = p123.sub(p012).normalize();
		return {
			point: p,
			tangent: tan
		}
	}
	return function bezierUniform(cps) {
		var p0 = cps[0];
		var p1 = cps[1];
		var p2 = cps[2];
		var p3 = cps[3];
		var points = [];
		for (var i = 0; i < n; i++) {
			var t = i / (n-1);
			points.push(bezierEval(p0, p1, p2, p3, t));
		}
		return points;
	}
}

// Return bezier control points for a given set of interpolation
//    points. 
// Assumes that points are all equally spaced 1 unit apart in knot space
function controlPoints(p0, p1, prev, next) {
	// Compute tangents
	var m0, m1;
	if (prev === undefined) {
		m0 = p1.clone().sub(p0);
	} else {
		m0 = p1.clone().sub(p0).divideScalar(2).add(
			p0.clone().sub(prev).divideScalar(2)
		);
	}
	if (next === undefined) {
		m1 = p1.clone().sub(p0);
	} else {
		m1 = p1.clone().sub(p0).divideScalar(2).add(
			next.clone().sub(p1).divideScalar(2)
		);
	}
	// Turn tangents into middle two bezier control points
	var p01 = p0.clone().add(m0.divideScalar(3));
	var p11 = p1.clone().sub(m1.divideScalar(3));
	return [p0, p01, p11, p1];
}

function vine(cps, curveFn, width0, width1, v0, v1, depth) {

	var mesh = new Mesh();

	var points = curveFn(cps);
	var n = points.length;

	var accumlengths = [0];
	for (var i = 1; i < n; i++) {
		var p = points[i].point;
		var p0 = points[i-1].point;
		var l = p.clone().sub(p0).length();
		var l0 = accumlengths[i-1];
		accumlengths.push(l+l0);
	}
	var totallength = accumlengths[n-1];
	var ts = [];
	for (var i = 0; i < n; i++) {
		var t = accumlengths[i] / totallength;
		ts.push(t);
		var v = (1-t)*v0 + t*v1;
		mesh.uvs.push(new THREE.Vector2(0, v));
		mesh.uvs.push(new THREE.Vector2(1, v));
	}

	for (var i = 0; i < n; i++) {
		var b = points[i];
		var center = b.point;
		var tangent = b.tangent;
		var normal = new THREE.Vector2(-tangent.y, tangent.x);
		var t = ts[i];
		var width = (1-t)*width0 + t*width1;
		var w2 = 0.5*width;
		normal.multiplyScalar(w2);
		var p0 = center.clone().sub(normal);
		var p1 = center.clone().add(normal);
		mesh.vertices.push(new THREE.Vector3(p0.x, p0.y, depth));
		mesh.vertices.push(new THREE.Vector3(p1.x, p1.y, depth));
		mesh.normals.push(new THREE.Vector3(-normal.x, -normal.y, 0));
		mesh.normals.push(new THREE.Vector3(normal.x, normal.y, 0));
	}

	var idx = 0;
	for (var i = 0; i < n-1; i++) {
		mesh.indices.push(idx); mesh.indices.push(idx+1); mesh.indices.push(idx+2);
		mesh.indices.push(idx+1); mesh.indices.push(idx+3); mesh.indices.push(idx+2);
		idx += 2;
	}

	return mesh;
}

// Just a unit quad, centered at the origin, with UVs from [-1, 1];
function billboard() {
	var mesh = new Mesh();
	mesh.vertices.push(new THREE.Vector3(-.5, -.5, 0));
	mesh.vertices.push(new THREE.Vector3(.5, -.5, 0));
	mesh.vertices.push(new THREE.Vector3(.5, .5, 0));
	mesh.vertices.push(new THREE.Vector3(-.5, .5, 0));
	mesh.uvs.push(new THREE.Vector2(0, 0));
	mesh.uvs.push(new THREE.Vector2(1, 0));
	mesh.uvs.push(new THREE.Vector2(1, 1));
	mesh.uvs.push(new THREE.Vector2(0, 1));
	mesh.indices.push(0); mesh.indices.push(1); mesh.indices.push(2);
	mesh.indices.push(2); mesh.indices.push(3); mesh.indices.push(0);
	return mesh;
}

// Convert geo linked list to a top-down point tree for branches, plus
//    arrays for other geo types.
function geo2objdata(geo) {
	// Kept in correspondence to map one to the other
	var branchListNodes = [];
	var branchTreeNodes = [];

	var leaves = [];

	// Sweep through geo once to create tree nodes, leaves, etc.
	var depth = 1;
	var depthEps = 1e-6;
	for (var g = geo; g; g = g.next) {
		if (g.type === 'branch') {
			// Store the tree root specially (since it doesn't map to anything
			//    in the linked list)
			if (g.parent === undefined) {
				branchTreeNodes.root = {
					// Needed b/c JSON loses prototype information
					point: new THREE.Vector2().copy(g.branch.start),
					depth: undefined,
					width: g.branch.width,
					children: []
				};
			}
			branchTreeNodes.push({
				point: new THREE.Vector2().copy(g.branch.end),
				depth: depth,
				width: g.branch.width,
				children: []
			});
			branchListNodes.push(g);
		} else if (g.type === 'leaf') {
			leaves.push({
				leaf: g.leaf,
				depth: depth - (1.5 + 0.1*Math.random())*depthEps
			});
		} else {
			throw 'Unrecognized geo type ' + g.type;
		}
		depth -= depthEps
	}

	// Sweep through tree nodes a second time to create child pointers
	for (var i = 0; i < branchListNodes.length; i++) {
		var branch = branchListNodes[i];
		var treeNode = branchTreeNodes[i];
		var parentBranch = branch.parent;
		var parentIdx = parentBranch === undefined ? 'root' : branchListNodes.indexOf(parentBranch);
		var parentNode = branchTreeNodes[parentIdx];
		parentNode.children.push(treeNode);
	}

	return {
		vineTree: branchTreeNodes.root,
		leaves: leaves.length > 0 ? leaves : undefined
	};
}

// Given a point tree, build a vine mesh for that tree
var bezFn = makeBezierUniform(20);
function vineTreeMesh(tree) {
	function buildVineTreeMesh(mesh, tree, v, prevs) {
		// Handle this point
		if (prevs.length > 0) {
			var p0 = prevs[prevs.length - 1].point;
			var p1 = tree.point;
			var prev = prevs.length === 2 ? prevs[0].point : undefined;
			var next = undefined;
			if (tree.children.length === 1) {
				next = tree.children[0].point;
			} else if (tree.children.length === 2) {
				// next = tree.children[0].point.clone().add(
				// 	tree.children[1].point
				// ).multiplyScalar(0.5);
				next = tree.children[0].point;
				// next = tree.children[1].point;
			}
			var cps = controlPoints(p0, p1, prev, next);
			var w0 = prevs[prevs.length - 1].width;
			var w1 = tree.width;
			var vineMesh = vine(cps, bezFn, w0, w1, v, v+1, tree.depth);
			mesh.append(vineMesh);
		}

		// Recurse
		prevs.push(tree);
		if (prevs.length > 2) {
			prevs.shift();
		}
		for (var i = 0; i < tree.children.length; i++) {
			buildVineTreeMesh(mesh, tree.children[i], v + 1, prevs.slice());
		}
	}

	var mesh = new Mesh();
	buildVineTreeMesh(mesh, tree, 0, []);
	return mesh;
}

function viewportMatrix(v) {
	return new THREE.Matrix4().makeOrthographic(v.xmin, v.xmax, v.ymax, v.ymin, v.zmin, v.zmax);
}

var vineAssets = {
	vineProgram: {
		type: 'shaderProgram',
		vertShader: 'shaders/vine_bumpy.vert',
		fragShader: 'shaders/vine_textured.frag',
		prog: undefined
	},
	billboardProgram: {
		type: 'shaderProgram',
		vertShader: 'shaders/billboard.vert',
		fragShader: 'shaders/billboard.frag',
		prog: undefined
	},
	leafTexture: {
		type: 'texture',
		image: 'textures/leaf.png',
		tex: undefined
	}
};
var bboard = billboard();
render.renderGLDetailed = function(gl, viewport, geo, asyncCallback) {
	ensureAssetsLoaded(gl, vineAssets, asyncCallback !== undefined, function() {

		gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

		var viewport3d = {
			xmin: viewport.xmin,
			xmax: viewport.xmax,
			ymin: viewport.ymin,
			ymax: viewport.ymax,
			zmin: -1,
			zmax: 1
		}
		var viewportMat = viewportMatrix(viewport3d);

		var objdata = geo2objdata(geo);

		//
		var vmesh = vineTreeMesh(objdata.vineTree);
		var vineProg = vineAssets.vineProgram.prog;
		gl.useProgram(vineProg);
		gl.uniformMatrix4fv(gl.getUniformLocation(vineProg, 'viewMat'), false, viewportMat.elements);
		vmesh.draw(gl, vineProg);
		vmesh.destroyBuffers(gl);
		//
		if (objdata.leaves) {
			var bbProg = vineAssets.billboardProgram.prog;
			gl.useProgram(bbProg);
			var matLoc = gl.getUniformLocation(bbProg, 'viewMat');
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, vineAssets.leafTexture.tex);
			gl.uniform1i(gl.getUniformLocation(bbProg, "tex"), 0);
			// Sort by depth (back to front)
			objdata.leaves.sort(function(a, b) { return a.depth > b.depth; });
			var scalemat = new THREE.Matrix4();
			var rotmat = new THREE.Matrix4();
			var transmat = new THREE.Matrix4();
			var fullmat = new THREE.Matrix4();
			for (var i = 0; i < objdata.leaves.length; i++) {
				var l = objdata.leaves[i];
				scalemat.makeScale(l.leaf.length, l.leaf.length, 1);
				rotmat.makeRotationZ(l.leaf.angle);
				var c = l.leaf.center;
				transmat.makeTranslation(c.x, c.y, l.depth);
				fullmat.copy(viewportMat).multiply(transmat).multiply(rotmat).multiply(scalemat);
				gl.uniformMatrix4fv(matLoc, false, fullmat.elements);
				bboard.draw(gl, bbProg);
			}
		}
		//

		gl.flush();

		if (asyncCallback) asyncCallback();
	});
}


// ----------------------------------------------------------------------------
// Pixel drawing

var drawPixelsAssets = {
	shaderProgram: {
		type: 'shaderProgram',
		vertShader: 'shaders/drawPixels.vert',
		fragShader: 'shaders/drawPixels.frag',
		prog: undefined
	}
};
var vertBufferCache = {};
var colorBufferCache = {};
// Pixels come in as bytes
render.drawPixels = function(gl, pixelData, asyncCallback) {
	ensureAssetsLoaded(gl, drawPixelsAssets, asyncCallback !== undefined, function() {
		var drawPixelsProg = drawPixelsAssets.shaderProgram.prog;
		gl.useProgram(drawPixelsProg);

		var h = gl.drawingBufferHeight;
		var w = gl.drawingBufferWidth;
		var size = w + 'x' + h;
		gl.viewport(0, 0, w, h);

		// Build vertex buffer
		var vertBuf = vertBufferCache[size];
		if (vertBuf === undefined) {
			vertBuf = gl.createBuffer();
			vertBufferCache[size] = vertBuf;

			var verts = [];
			for (var y = 0; y < h; y++) {
				var ty = (y + 0.5) / h;
				var ny = (1-ty)*-1 + ty*1;
				for (var x = 0; x < w; x++) {
					var tx = (x + 0.5) / w;
					var nx = (1-tx)*-1 + tx*1;
					verts.push(nx); verts.push(ny);
				}
			}
			verts = new Float32Array(verts);

			gl.bindBuffer(gl.ARRAY_BUFFER, vertBuf);
			gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
		}

		// Build color buffer
		pixelData = new Float32Array(pixelData);	// Shader will do 1/255 division
		var colorBuf = colorBufferCache[size];
		if (colorBuf === undefined) {
			colorBuf = gl.createBuffer();
			colorBufferCache[size] = colorBuf;
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, colorBuf);
		gl.bufferData(gl.ARRAY_BUFFER, pixelData, gl.STATIC_DRAW);

		// Bind
		var vertLoc = gl.getAttribLocation(drawPixelsProg, "inPos");
		gl.enableVertexAttribArray(vertLoc);
		gl.bindBuffer(gl.ARRAY_BUFFER, vertBuf);
		gl.vertexAttribPointer(vertLoc, 2, gl.FLOAT, false, 0, 0);
		var colorLoc = gl.getAttribLocation(drawPixelsProg, "inColor");
		gl.enableVertexAttribArray(colorLoc);
		gl.bindBuffer(gl.ARRAY_BUFFER, colorBuf);
		gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 0, 0);

		// Render
		gl.drawArrays(gl.POINTS, 0, pixelData.length/4);
		gl.flush();
		gl.disableVertexAttribArray(vertLoc);
		gl.disableVertexAttribArray(colorLoc);

		if (asyncCallback) asyncCallback();
	});
}


// ----------------------------------------------------------------------------


if (client === 'node') {
	module.exports = render
}


})();



