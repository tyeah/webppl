
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
	// Next, build a map of unique branches (for deduplication).
	var branchIdToIndex = {};
	var uniqueBranches = [];
	var nextBranchID = 0;
	function registerBranches(branches) {
		if (branches && !branches.hasOwnProperty('__id')) {
			branches.__id = nextBranchID++;
			branchIdToIndex[branches.__id] = uniqueBranches.length;
			uniqueBranches.push(branches);
			registerBranches(branches.next);
		}
	}
	for (var i = 0; i < uniqueParticlesList.length; i++) {
		var branches = uniqueParticlesList[i].store.branches;
		registerBranches(branches);
	}
	// Convert branches 'next' pointers to indices, get rid of __id tags.
	uniqueBranches = uniqueBranches.map(function(branches) {
		var b = { branch: branches.branch, next: null };
		if (branches.next) {
			b.next = branchIdToIndex[branches.next.__id];
		}
		return b;
	})
	// Process the particles to prepare them for consumption by the UI.
	uniqueParticlesList = uniqueParticlesList.map(function(p) {
		return {
			log_prior: p.logprior,
			log_like: p.loglike,
			log_post: p.logpost,
			active: p.active,
			similarity: p.store.sim,
			num_branches: p.store.branches.n,
			branches: branchIdToIndex[p.store.branches.__id]
		}
	});
	// Finally, return deduplicated history object.
	return {
		particles: uniqueParticlesList,
		branches: uniqueBranches,
		generationIndices: history.map(function(particles) {
			return particles.map(function(p) {
				return particleIdToIndex[p.id];
			});
		})
	};
}

particleHistoryUtils.decompress = function(compressedHistory) {
	// Reconstruct the branches lists by converting indices back to pointers.
	for (var i = 0; i < compressedHistory.branches.length; i++) {
		var branches = compressedHistory.branches[i];
		if (branches.next !== null) {
			branches.next = compressedHistory.branches[branches.next];
		}
	}
	// Convert particle branch ids to pointers as well.
	for (var i = 0; i < compressedHistory.particles.length; i++) {
		var p = compressedHistory.particles[i];
		p.branches = compressedHistory.branches[p.branches];
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


