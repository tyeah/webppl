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

function loadShader_node(filename, async, callback) {
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
function loadShader_browser(filename, async, callback) {
	$.ajax({
		async: async,
		dataType: 'text',
	    url: filename,
	    success: function (data) {
	        callback(data);
	    }
	});
}
var loadShader = (client === 'node') ? loadShader_node : loadShader_browser;

function loadShaders(shaders, async, callback) {
	loadShader(shaders[0], async, function(text) {
		if (shaders.length === 1) {
			callback([text]);
		} else {
			loadShaders(shaders.slice(1), async, function(textList) {
				var fullList = [text].concat(textList);
				callback(fullList);
			});
		}
	});
}

function loadAndCompileProgram(gl, vertFilename, fragFilename, async, callback) {
	loadShaders([vertFilename, fragFilename], async, function(sources) {
		var prog = compileProgram(gl, sources[0], sources[1]);
		callback(prog);
	});
}


// ----------------------------------------------------------------------------
// 2D Mesh class


function Mesh2D() {
	this.vertices = [];
	this.uvs = [];
	this.normals = [];
	this.indices = [];

	this.buffers = undefined;
};
Mesh2D.prototype.append = function(other) {
	var n = this.vertices.length;
	this.vertices = this.vertices.concat(other.vertices);
	this.uvs = this.uvs.concat(other.uvs);
	this.normals = this.normals.concat(other.normals);
	var m = other.indices.length;
	for (var i = 0; i < m; i++) {
		this.indices.push(other.indices[i] + n);
	}
};
Mesh2D.prototype.recomputeBuffers = function() {
	var n = this.vertices.length;

	var vertices = new Float32Array(n*2);
	for (var i = 0; i < n; i++) {
		var v = this.vertices[i];
		vertices[2*i] = v.x;
		vertices[2*i+1] = v.y;
	}

	var uvs = new Float32Array(n*2);
	for (var i = 0; i < n; i++) {
		var uv = this.uvs[i];
		uvs[2*i] = uv.x;
		uvs[2*i+1] = uv.y;
	}

	var normals = new Float32Array(n*2);
	for (var i = 0; i < n; i++) {
		var nrm = this.normals[i];
		normals[2*i] = nrm.x;
		normals[2*i+1] = nrm.y;
	}

	indices = new Uint16Array(this.indices);

	// ------

	this.destroyBuffers();	// get rid of existing buffers (if any)
	this.buffers = {};

	this.buffers.vertices = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.vertices);
	gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

	this.buffers.uvs = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.uvs);
	gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);

	this.buffers.normals = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.normals);
	gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);

	this.buffers.indices = gl.createBuffer();
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.indices);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
	this.buffers.numIndices = indices.length;
};
Mesh2D.prototype.destroyBuffers = function() {
	if (this.buffers !== undefined) {
		gl.deleteBuffer(this.buffers.vertices);
		gl.deleteBuffer(this.buffers.uvs);
		gl.deleteBuffer(this.buffers.normals);
		gl.deleteBuffer(this.buffers.indices);
		this.buffers = undefined;
	}
};
Mesh2D.prototype.draw = function(gl, prog) {
	if (this.buffers === undefined) {
		this.recomputeBuffers();
	}

	var vertLoc = gl.getAttribLocation(prog, "inPos");
	var uvLoc = gl.getAttribLocation(prog, "inUV");
	var normLoc = gl.getAttribLocation(prog, "inNorm");

	gl.enableVertexAttribArray(vertLoc);
	gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.vertices);
	gl.vertexAttribPointer(vertLoc, 2, gl.FLOAT, false, 0, 0);

	if (uvLoc !== -1) {
		gl.enableVertexAttribArray(uvLoc);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.uvs);
		gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);
	}

	if (normLoc !== -1) {
		gl.enableVertexAttribArray(normLoc);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.normals);
		gl.vertexAttribPointer(normLoc, 2, gl.FLOAT, false, 0, 0);
	}

	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.indices);
	gl.drawElements(gl.TRIANGLES, this.buffers.numIndices, gl.UNSIGNED_SHORT, 0);
};


// ----------------------------------------------------------------------------
// Line segment rendering


render.renderLineSegs = function(canvas, viewport, branches, isIncremental, fillBackground) {
	if (viewport === undefined)
		viewport = {xmin: 0, ymin: 0, xmax: canvas.width, ymax: canvas.height};

	fillBackground = fillBackground === undefined ? true : fillBackground;

	var ctx = canvas.getContext('2d');

	function world2img(p) {
		return new THREE.Vector2(
			canvas.width * (p.x - viewport.xmin) / (viewport.xmax - viewport.xmin),
			canvas.height * (p.y - viewport.ymin) / (viewport.ymax - viewport.ymin)
		);
	}

	function renderBranch(branch) {
		var istart = world2img(branch.start);
		var iend = world2img(branch.end);
		var iwidth = branch.width / (viewport.xmax - viewport.xmin) * canvas.width;
		ctx.beginPath();
		ctx.lineWidth = iwidth;
		ctx.moveTo(istart.x, istart.y);
		ctx.lineTo(iend.x, iend.y);
		ctx.stroke();
	}

	if (fillBackground) {
		ctx.rect(0, 0, canvas.width, canvas.height);
		ctx.fillStyle = 'white';
		ctx.fill();
	}

	// Draw
	ctx.strokeStyle = 'black';
	ctx.lineCap = 'round';
	if (isIncremental) {
		renderBranch(branches.branch);
	} else {
		for (var brObj = branches; brObj; brObj = brObj.next) {
			renderBranch(brObj.branch);
		}
	}
}


// ----------------------------------------------------------------------------
// Vine/beanstalk rendering


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

function vine(cps, curveFn, width0, width1, v0, v1) {

	var mesh = new Mesh2D();

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
		mesh.vertices.push(p0);
		mesh.vertices.push(p1);
		mesh.normals.push(normal.clone().negate());
		mesh.normals.push(normal);
	}

	var idx = 0;
	for (var i = 0; i < n-1; i++) {
		mesh.indices.push(idx); mesh.indices.push(idx+1); mesh.indices.push(idx+2);
		mesh.indices.push(idx+1); mesh.indices.push(idx+3); mesh.indices.push(idx+2);
		idx += 2;
	}

	return mesh;
}

function vineTree(tree, bezFn) {

	var mesh = new Mesh2D();

	function buildVineTreeRec(tree, v, prevs) {
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
				// next = tree.children[0].point;
				next = tree.children[1].point;
			}
			var cps = controlPoints(p0, p1, prev, next);
			var w0 = prevs[prevs.length - 1].width;
			var w1 = tree.width;
			var vineMesh = vine(cps, bezFn, w0, w1, v, v+1);
			mesh.append(vineMesh);
		}

		// Recurse
		prevs.push(tree);
		if (prevs.length > 2) {
			prevs.shift();
		}
		for (var i = 0; i < tree.children.length; i++) {
			buildVineTreeRec(tree.children[i], v + 1, prevs.slice());
		}
	}

	buildVineTreeRec(tree, 0, []);
	return mesh;
}

// Convert branch linked list (w/ parent pointers) to a top-down point tree
//    (for WebGL vine rendering)
function branchListToPointTree(branches) {
	// Kept in correspondence to map one to the other
	var linkedListNodes = [];
	var treeNodes = [];

	// Sweep through once to create the nodes, but not the child pointers
	for (var br = branches; br; br = br.next) {
		// Store the tree root specially (since it doesn't map to anything
		//    in the linked list)
		if (br.parent === undefined) {
			treeNodes.root = {
				// Needed b/c JSON loses prototype information
				point: new THREE.Vector2().copy(br.branch.start),
				width: br.branch.width,
				children: []
			};
		}
		treeNodes.push({
			point: new THREE.Vector2().copy(br.branch.end),
			width: br.branch.width,
			children: []
		});
		linkedListNodes.push(br);
	}

	// Sweep through a second time to create child pointers
	for (var br = branches; br; br = br.next) {
		var idx = linkedListNodes.indexOf(br);
		var treeNode = treeNodes[idx];
		var parentBr = br.parent;
		var parentIdx = parentBr === undefined ? 'root' : linkedListNodes.indexOf(parentBr);
		var parentNode = treeNodes[parentIdx];
		parentNode.children.push(treeNode);
	}


	return treeNodes.root;
}

function viewportMatrix(v) {
	// Column-major nonsense
	return [
		2 /(v.xmax - v.xmin), 0, 0,
		0, 2 / (v.ymax - v.ymin), 0,
		-(v.xmin + v.xmax) / (v.xmax - v.xmin), -(v.ymin + v.ymax) / (v.ymax - v.ymin), 1
	];
}

var bezFn = makeBezierUniform(20);
var vineVertShader = ROOT + '/shaders/vine_bumpy.vert';
var vineFragShader = ROOT + '/shaders/vine_textured.frag';
var vineProg;
function renderVinesImpl(gl, viewport, branches, asyncCallback) {

	gl.useProgram(vineProg);

	gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

	var viewportMat = viewportMatrix(viewport);
	gl.uniformMatrix3fv(gl.getUniformLocation(vineProg, 'viewMat'), false, viewportMat);

	var tree = branchListToPointTree(branches);
	var mesh = vineTree(tree, bezFn);
	mesh.draw(gl, vineProg);
	gl.flush();
	mesh.destroyBuffers();

	if (asyncCallback) asyncCallback();
}
render.renderVines = function(gl, viewport, branches, asyncCallback) {
	if (vineProg === undefined) {
		loadAndCompileProgram(gl, vineVertShader, vineFragShader, asyncCallback !== undefined, function(prog) {
			vineProg = prog;
			renderVinesImpl(gl, viewport, branches, asyncCallback);
		});
	} else {
		renderVinesImpl(gl, viewport, branches, asyncCallback);
	}
}


// ----------------------------------------------------------------------------


if (client === 'node') {
	module.exports = render
}


})();



