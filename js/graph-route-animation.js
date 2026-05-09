(function () {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function distance(a, b) {
    var dx = a.baseX - b.baseX;
    var dy = a.baseY - b.baseY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function createCanvas(container) {
    var canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    container.innerHTML = "";
    container.appendChild(canvas);
    return canvas;
  }

  function buildNodes(width, height, options) {
    var nodes = [];
    var columns = Math.max(4, options.columns || 5);
    var minPerColumn = options.minNodesPerColumn || 3;
    var maxPerColumn = options.maxNodesPerColumn || 5;
    var leftPad = width * 0.08;
    var rightPad = width * 0.08;
    var topPad = height * 0.14;
    var bottomPad = height * 0.14;
    var usableWidth = Math.max(120, width - leftPad - rightPad);
    var usableHeight = Math.max(120, height - topPad - bottomPad);
    var id = 0;

    for (var column = 0; column < columns; column += 1) {
      var countRange = maxPerColumn - minPerColumn + 1;
      var count = minPerColumn + Math.floor(Math.random() * Math.max(1, countRange));
      var x = leftPad + (usableWidth * column) / Math.max(1, columns - 1);
      var laneGap = usableHeight / Math.max(1, count - 1);

      for (var row = 0; row < count; row += 1) {
        var yBase = count === 1 ? usableHeight / 2 : laneGap * row;
        var jitterY = (Math.random() - 0.5) * Math.min(36, laneGap * 0.45);
        var jitterX = (Math.random() - 0.5) * Math.min(20, usableWidth / columns * 0.16);

        nodes.push({
          id: id,
          column: column,
          row: row,
          baseX: x + jitterX,
          baseY: topPad + yBase + jitterY,
          radius: options.nodeRadiusMin + Math.random() * (options.nodeRadiusMax - options.nodeRadiusMin),
          phase: Math.random() * Math.PI * 2,
          drift: 3 + Math.random() * 8
        });
        id += 1;
      }
    }

    return nodes;
  }

  function addEdge(edges, seen, fromId, toId, weight, emphasis) {
    var a = Math.min(fromId, toId);
    var b = Math.max(fromId, toId);
    var key = a + ":" + b;
    if (seen[key]) {
      return;
    }
    seen[key] = true;
    edges.push({
      from: fromId,
      to: toId,
      weight: weight,
      emphasis: emphasis || 1
    });
  }

  function buildEdges(nodes) {
    var nodesByColumn = {};
    var edges = [];
    var seen = {};

    nodes.forEach(function (node) {
      if (!nodesByColumn[node.column]) {
        nodesByColumn[node.column] = [];
      }
      nodesByColumn[node.column].push(node);
    });

    Object.keys(nodesByColumn).forEach(function (columnKey) {
      var column = parseInt(columnKey, 10);
      var current = nodesByColumn[column] || [];
      var next = nodesByColumn[column + 1] || [];
      var skip = nodesByColumn[column + 2] || [];

      current.forEach(function (node, index) {
        var sortedNext = next.slice().sort(function (a, b) {
          return distance(node, a) - distance(node, b);
        });

        sortedNext.slice(0, Math.min(3, sortedNext.length)).forEach(function (target, targetIndex) {
          addEdge(edges, seen, node.id, target.id, distance(node, target), targetIndex === 0 ? 1.35 : 1);
        });

        if (current[index + 1]) {
          addEdge(edges, seen, node.id, current[index + 1].id, distance(node, current[index + 1]) * 1.1, 0.7);
        }

        if (skip.length && Math.random() > 0.65) {
          var skipTarget = skip[Math.floor(Math.random() * skip.length)];
          addEdge(edges, seen, node.id, skipTarget.id, distance(node, skipTarget) * 1.18, 0.55);
        }
      });
    });

    return edges;
  }

  function buildAdjacency(nodes, edges) {
    var adjacency = {};
    nodes.forEach(function (node) {
      adjacency[node.id] = [];
    });

    edges.forEach(function (edge) {
      adjacency[edge.from].push({ to: edge.to, weight: edge.weight });
      adjacency[edge.to].push({ to: edge.from, weight: edge.weight });
    });

    return adjacency;
  }

  function findPath(nodes, adjacency, startId, endId) {
    var queue = [];
    var distances = {};
    var previous = {};
    var visited = {};

    nodes.forEach(function (node) {
      distances[node.id] = Infinity;
    });

    distances[startId] = 0;
    queue.push({ id: startId, cost: 0 });

    while (queue.length) {
      queue.sort(function (a, b) {
        return a.cost - b.cost;
      });

      var current = queue.shift();
      if (visited[current.id]) {
        continue;
      }
      visited[current.id] = true;

      if (current.id === endId) {
        break;
      }

      (adjacency[current.id] || []).forEach(function (neighbor) {
        var nextCost = distances[current.id] + neighbor.weight;
        if (nextCost < distances[neighbor.to]) {
          distances[neighbor.to] = nextCost;
          previous[neighbor.to] = current.id;
          queue.push({ id: neighbor.to, cost: nextCost });
        }
      });
    }

    var path = [];
    var walker = endId;
    while (walker !== undefined) {
      path.unshift(walker);
      if (walker === startId) {
        break;
      }
      walker = previous[walker];
    }

    if (!path.length || path[0] !== startId) {
      return [];
    }

    return path;
  }

  function buildPathSegments(path, nodeLookup) {
    var segments = [];
    var total = 0;

    for (var i = 0; i < path.length - 1; i += 1) {
      var a = nodeLookup[path[i]];
      var b = nodeLookup[path[i + 1]];
      var length = Math.sqrt(Math.pow(b.baseX - a.baseX, 2) + Math.pow(b.baseY - a.baseY, 2));
      segments.push({
        from: a,
        to: b,
        length: length
      });
      total += length;
    }

    return {
      segments: segments,
      total: total
    };
  }

  function getPointAlongPath(pathData, progress) {
    var targetDistance = pathData.total * progress;
    var walked = 0;

    for (var i = 0; i < pathData.segments.length; i += 1) {
      var segment = pathData.segments[i];
      if (walked + segment.length >= targetDistance) {
        var localProgress = (targetDistance - walked) / segment.length;
        return {
          x: segment.from.x + (segment.to.x - segment.from.x) * localProgress,
          y: segment.from.y + (segment.to.y - segment.from.y) * localProgress
        };
      }
      walked += segment.length;
    }

    var last = pathData.segments[pathData.segments.length - 1];
    return last ? { x: last.to.x, y: last.to.y } : null;
  }

  function GraphRouteAnimation(container, options) {
    this.container = container;
    this.options = options;
    this.canvas = createCanvas(container);
    this.ctx = this.canvas.getContext("2d");
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.nodes = [];
    this.edges = [];
    this.nodeLookup = {};
    this.path = [];
    this.pathData = { segments: [], total: 0 };
    this.startNode = null;
    this.endNode = null;
    this.lastTimestamp = 0;
    this.routeStartedAt = 0;
    this.routeDuration = options.routeDuration || 3800;
    this.routePause = options.routePause || 1200;
    this.reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.handleResize = this.rebuild.bind(this);
    this.rebuild();
    window.addEventListener("resize", this.handleResize);
    this.rafId = window.requestAnimationFrame(this.animate.bind(this));
  }

  GraphRouteAnimation.prototype.pickRoute = function () {
    var firstColumn = this.nodes.filter(function (node) {
      return node.column === 0;
    });
    var lastColumn = this.nodes.filter(function (node) {
      return node.column === this.maxColumn;
    }, {
      maxColumn: Math.max.apply(Math, this.nodes.map(function (node) { return node.column; }))
    });

    this.startNode = firstColumn[Math.floor(Math.random() * firstColumn.length)] || null;
    this.endNode = lastColumn[Math.floor(Math.random() * lastColumn.length)] || null;

    if (!this.startNode || !this.endNode) {
      this.path = [];
      this.pathData = { segments: [], total: 0 };
      return;
    }

    this.path = findPath(this.nodes, this.adjacency, this.startNode.id, this.endNode.id);
    this.pathData = buildPathSegments(this.path, this.nodeLookup);
    this.routeStartedAt = 0;
  };

  GraphRouteAnimation.prototype.rebuild = function () {
    var rect = this.container.getBoundingClientRect();
    var width = Math.max(240, Math.floor(rect.width));
    var height = Math.max(180, Math.floor(rect.height));

    this.canvas.width = width * this.dpr;
    this.canvas.height = height * this.dpr;
    this.canvas.style.width = width + "px";
    this.canvas.style.height = height + "px";
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.width = width;
    this.height = height;
    this.nodes = buildNodes(width, height, this.options);
    this.nodeLookup = {};
    this.nodes.forEach(function (node) {
      this.nodeLookup[node.id] = node;
    }, this);
    this.edges = buildEdges(this.nodes);
    this.adjacency = buildAdjacency(this.nodes, this.edges);
    this.pickRoute();
  };

  GraphRouteAnimation.prototype.updateNodePositions = function (time) {
    this.nodes.forEach(function (node) {
      var driftX = Math.sin(time * 0.00055 + node.phase) * node.drift;
      var driftY = Math.cos(time * 0.00072 + node.phase) * node.drift * 0.65;
      node.x = clamp(node.baseX + driftX, 18, this.width - 18);
      node.y = clamp(node.baseY + driftY, 18, this.height - 18);
    }, this);
  };

  GraphRouteAnimation.prototype.drawEdges = function () {
    var ctx = this.ctx;
    var pathPairs = {};

    for (var i = 0; i < this.path.length - 1; i += 1) {
      var a = Math.min(this.path[i], this.path[i + 1]);
      var b = Math.max(this.path[i], this.path[i + 1]);
      pathPairs[a + ":" + b] = true;
    }

    this.edges.forEach(function (edge) {
      var from = this.nodeLookup[edge.from];
      var to = this.nodeLookup[edge.to];
      var key = Math.min(edge.from, edge.to) + ":" + Math.max(edge.from, edge.to);
      var isPath = !!pathPairs[key];

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.lineWidth = isPath ? 2.3 : 1.1 * edge.emphasis;
      ctx.strokeStyle = isPath ? "rgba(154, 228, 255, 0.85)" : "rgba(133, 198, 236, 0.2)";
      ctx.stroke();
    }, this);
  };

  GraphRouteAnimation.prototype.drawNodes = function (time) {
    var ctx = this.ctx;

    this.nodes.forEach(function (node) {
      var pulse = 0.55 + 0.45 * Math.sin(time * 0.002 + node.phase);
      var isStart = this.startNode && node.id === this.startNode.id;
      var isEnd = this.endNode && node.id === this.endNode.id;

      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius + pulse * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = isStart || isEnd ? "rgba(255, 255, 255, 0.98)" : "rgba(214, 243, 255, 0.92)";
      ctx.shadowColor = isStart || isEnd ? "rgba(111, 214, 255, 0.95)" : "rgba(86, 196, 255, 0.45)";
      ctx.shadowBlur = isStart || isEnd ? 22 : 12;
      ctx.fill();
      ctx.shadowBlur = 0;

      if (isStart || isEnd) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 7 + pulse * 2.5, 0, Math.PI * 2);
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = isStart ? "rgba(111, 214, 255, 0.55)" : "rgba(255, 255, 255, 0.4)";
        ctx.stroke();
      }
    }, this);
  };

  GraphRouteAnimation.prototype.drawRoutePulse = function (time) {
    if (!this.pathData.total || !this.pathData.segments.length) {
      return;
    }

    if (!this.routeStartedAt) {
      this.routeStartedAt = time;
    }

    var elapsed = time - this.routeStartedAt;
    var cycle = this.routeDuration + this.routePause;

    if (elapsed >= cycle) {
      this.pickRoute();
      this.routeStartedAt = time;
      elapsed = 0;
    }

    if (elapsed > this.routeDuration) {
      return;
    }

    var progress = clamp(elapsed / this.routeDuration, 0, 1);
    var point = getPointAlongPath(this.pathData, progress);
    if (!point) {
      return;
    }

    var ctx = this.ctx;
    var gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, 20);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.98)");
    gradient.addColorStop(0.35, "rgba(111, 214, 255, 0.9)");
    gradient.addColorStop(1, "rgba(111, 214, 255, 0)");

    ctx.beginPath();
    ctx.arc(point.x, point.y, 16, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
  };

  GraphRouteAnimation.prototype.draw = function (time) {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.updateNodePositions(time);
    this.drawEdges();
    this.drawNodes(time);
    if (!this.reducedMotion) {
      this.drawRoutePulse(time);
    }
  };

  GraphRouteAnimation.prototype.animate = function (time) {
    this.draw(time);
    this.rafId = window.requestAnimationFrame(this.animate.bind(this));
  };

  GraphRouteAnimation.prototype.destroy = function () {
    window.cancelAnimationFrame(this.rafId);
    window.removeEventListener("resize", this.handleResize);
  };

  window.CashlyGraphRouteAnimation = {
    init: function (targetId, options) {
      var container = typeof targetId === "string" ? document.getElementById(targetId) : targetId;
      if (!container) {
        return null;
      }

      return new GraphRouteAnimation(container, {
        columns: options && options.columns ? options.columns : 5,
        minNodesPerColumn: options && options.minNodesPerColumn ? options.minNodesPerColumn : 3,
        maxNodesPerColumn: options && options.maxNodesPerColumn ? options.maxNodesPerColumn : 5,
        nodeRadiusMin: options && options.nodeRadiusMin ? options.nodeRadiusMin : 4.5,
        nodeRadiusMax: options && options.nodeRadiusMax ? options.nodeRadiusMax : 7.5,
        routeDuration: options && options.routeDuration ? options.routeDuration : 3600,
        routePause: options && options.routePause ? options.routePause : 1100
      });
    }
  };
})();
