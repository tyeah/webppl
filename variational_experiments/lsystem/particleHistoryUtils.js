
var particleHistoryUtils = {};

particleHistoryUtils.compress = function(history) {
	// First, build a map of unique particles (for deduplication).
	var particleIdToIndex = {};
	var uniqueParticlesList = [];
	for (var gen = 0; gen < history.length; gen++) {
		var particles = history[gen];
		for (var i = 0; i < particles.length; i++) {
			var p = particles[i];
			if (!particleIdToIndex.hasOwnProperty(p.id)) {
				particleIdToIndex[p.id] = uniqueParticlesList.length;
				uniqueParticlesList.push(p);
			}
		}
	}
	// Next, build a map of unique geos (for deduplication).
	var geoIdToIndex = {};
	var uniqueGeos = [];
	var nextGeoID = 0;
	function registerGeo(geo) {
		if (geo && !geo.hasOwnProperty('__id')) {
			geo.__id = nextGeoID++;
			geoIdToIndex[geo.__id] = uniqueGeos.length;
			uniqueGeos.push(geo);
			registerGeo(geo.next);
		}
	}
	for (var i = 0; i < uniqueParticlesList.length; i++) {
		var geo = uniqueParticlesList[i].store.geo;
		registerGeo(geo);
	}
	// Convert geo 'next' and 'parent' pointers to indices, get rid of __id tags.
	uniqueGeos = uniqueGeos.map(function(geo) {
		var g = {};
		for (var prop in geo) { g[prop] = geo[prop]; }
		delete g.__id;
		g.next = undefined;
		if (geo.next) {
			g.next = geoIdToIndex[geo.next.__id];
		}
		if (geo.parent) {
			g.parent = geoIdToIndex[geo.parent.__id];
		}
		return g;
	})
	// Process the particles to prepare them for consumption by the UI.
	uniqueParticlesList = uniqueParticlesList.map(function(p) {
		return {
			log_prior: p.logprior,
			log_like: p.loglike,
			log_post: p.logpost,
			active: p.active,
			similarity: p.store.sim,
			num_geo: p.store.geo.n,
			geo: geoIdToIndex[p.store.geo.__id],
			time: p.time
		}
	});
	// Finally, return deduplicated history object.
	return {
		particles: uniqueParticlesList,
		geo: uniqueGeos,
		generationIndices: history.map(function(particles) {
			return particles.map(function(p) {
				return particleIdToIndex[p.id];
			});
		})
	};
}

particleHistoryUtils.decompress = function(compressedHistory) {
	// Reconstruct the geo lists by converting indices back to pointers.
	for (var i = 0; i < compressedHistory.geo.length; i++) {
		var geo = compressedHistory.geo[i];
		if (geo.next !== null) {
			geo.next = compressedHistory.geo[geo.next];
		}
		if (geo.parent !== null) {
			geo.parent = compressedHistory.geo[geo.parent];
		}
	}
	// Convert particle geo ids to pointers as well.
	for (var i = 0; i < compressedHistory.particles.length; i++) {
		var p = compressedHistory.particles[i];
		p.geo = compressedHistory.geo[p.geo];
	}
	// Dereference the particle indices to product a list of list of particles.
	return compressedHistory.generationIndices.map(function(indices) {
		return indices.map(function(i) {
			return compressedHistory.particles[i];
		})
	});
}

if (typeof(window) === 'undefined') {
	module.exports = particleHistoryUtils;
}


