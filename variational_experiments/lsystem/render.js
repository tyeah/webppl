if (typeof(window) === 'undefined')  {
	var THREE = require('three');
}

var render = {};

(function() {

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
	var uvs = [];
	for (var i = 0; i < n; i++) {
		var t = accumlengths[i] / totallength;
		ts.push(t);
		var v = (1-t)*v0 + t*v1;
		uvs.push(new THREE.Vector2(0, v));
		uvs.push(new THREE.Vector2(1, v));
	}

	var vertices = [];
	var normals = [];
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
		vertices.push(p0);
		vertices.push(p1);
		normals.push(normal.clone().negate());
		normals.push(normal);
	}

	var indices = [];
	var idx = 0;
	for (var i = 0; i < n-1; i++) {
		indices.push(idx); indices.push(idx+1); indices.push(idx+2);
		indices.push(idx+1); indices.push(idx+3); indices.push(idx+2);
		idx += 2;
	}

	return {
		vertices: vertices,
		uvs: uvs,
		normals: normals,
		indices: indices
	};
}

function meshToBuffers(mesh) {

	var vertices = [];
	var n = mesh.vertices.length;
	for (var i = 0; i < n; i++) {
		var v = mesh.vertices[i];
		vertices.push(v.x); vertices.push(v.y);
	}

	var uvs = [];
	n = mesh.uvs.length;
	for (var i = 0; i < n; i++) {
		var uv = mesh.uvs[i];
		uvs.push(uv.x); uvs.push(uv.y);
	}

	var normals = [];
	n = mesh.normals.length;
	for (var i = 0; i < n; i++) {
		var nrm = mesh.normals[i];
		normals.push(nrm.x); normals.push(nrm.y);
	}

	return {
		vertices: new Float32Array(vertices),
		uvs: new Float32Array(uvs),
		normals: new Float32Array(normals),
		indices: new Uint16Array(mesh.indices)
	};
}

function viewportMatrix(v) {
	// Column-major nonsense
	return [
		2 /(v.xmax - v.xmin), 0, 0,
		0, 2 / (v.ymax - v.ymin), 0,
		-(v.xmin + v.xmax) / (v.xmax - v.xmin), -(v.ymin + v.ymax) / (v.ymax - v.ymin), 1
	];
}

function drawBuf(gl, locs, buf) {
	gl.enableVertexAttribArray( locs.vertices );
	var posBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, buf.vertices, gl.STATIC_DRAW);
	gl.vertexAttribPointer(locs.vertices, 2, gl.FLOAT, false, 0, 0);

	gl.enableVertexAttribArray( locs.uvs );
	var uvBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, buf.uvs, gl.STATIC_DRAW);
	gl.vertexAttribPointer(locs.uvs, 2, gl.FLOAT, false, 0, 0);

	gl.enableVertexAttribArray( locs.normals );
	var normBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, normBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, buf.normals, gl.STATIC_DRAW);
	gl.vertexAttribPointer(locs.normals, 2, gl.FLOAT, false, 0, 0);

	var indexBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, buf.indices, gl.STATIC_DRAW);

	gl.drawElements(gl.TRIANGLES, buf.indices.length, gl.UNSIGNED_SHORT, 0);
}

function drawVineSeg(gl, locs, bezFn, cps, width0, width1, v0, v1) {
	var mesh = vine(cps, bezFn, width0, width1, v0, v1);
	var buf = meshToBuffers(mesh);
	drawBuf(gl, locs, buf);
}

function drawVineTree(gl, locs, bezFn, tree) {
	function drawVineTreeRec(tree, v, prevs) {
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
			drawVineSeg(gl, locs, bezFn, cps, w0, w1, v, v + 1);
		}

		// Recurse
		prevs.push(tree);
		if (prevs.length > 2) {
			prevs.shift();
		}
		for (var i = 0; i < tree.children.length; i++) {
			drawVineTreeRec(tree.children[i], v + 1, prevs.slice());
		}
	}

	drawVineTreeRec(tree, 0, []);
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

var bezFn = makeBezierUniform(20);
render.renderVines = function(gl, prog, locs, viewport, branches, clearColor) {

	gl.useProgram(prog);

	gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

	var viewportMat = viewportMatrix(viewport);
	gl.uniformMatrix3fv(gl.getUniformLocation(prog, 'viewMat'), false, viewportMat);

	if (clearColor) {
		gl.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3]);
		gl.clear(gl.COLOR_BUFFER_BIT);
	}
	var tree = branchListToPointTree(branches);
	drawVineTree(gl, locs, bezFn, tree);
	gl.flush();
}


// ----------------------------------------------------------------------------


if (typeof(window) === 'undefined') {
	module.exports = render
}


})();



