
var particleHistoryUtils = {};

particleHistoryUtils.compress = function(history) {
	return history.map(function(particles) {
		var uniqueParticles = [];
		var indices = [];
		for (var i = 0; i < particles.length; i++) {
			var p = particles[i];
			var idx = uniqueParticles.indexOf(p);
			if (idx === -1) {
				indices.push(uniqueParticles.length);
				uniqueParticles.push(p);
			} else {
				indices.push(idx);
			}
		}
		return { particles: uniqueParticles, indices: indices };
	});
}

particleHistoryUtils.extractRelevantData = function(compressedHistory) {
	return compressedHistory.map(function(particleData) {
		return {
			indices: particleData.indices,
			particles: particleData.particles.map(function(p) {
				return {
					log_prior: p.logprior,
					log_like: p.loglike,
					log_post: p.logpost,
					active: p.active,
					similarity: p.store.sim,
					branches: p.store.branches
				}
			})
		}
	});
}

particleHistoryUtils.compressAndExtract = function(history) {
	return particleHistoryUtils.extractRelevantData(particleHistoryUtils.compress(history));
}

particleHistoryUtils.decompress = function(compressedHistory) {
	return compressedHistory.map(function(particleData) {
		return particleData.indices.map(function(i) {
			return particleData.particles[i];
		})
	});
}

if (typeof(window) === 'undefined') {
	module.exports = particleHistoryUtils;
}