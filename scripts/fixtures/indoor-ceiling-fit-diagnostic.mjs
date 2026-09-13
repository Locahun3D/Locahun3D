// Fixture-only hypothesis: trim quantized ceiling air, retaining all observations.
export function fitIndoorCeiling(points, boxes, cellSize) {
  const cells = new Map();
  const key = (x, y, z) => [x, y, z].map(v => Math.floor(v / cellSize)).join(',');
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i], y = points[i + 1], z = points[i + 2];
    if (!(x > -3 && x < 1 && z > 0 && z < 4 && y > -1.3 && y < -.5)) continue;
    const k = key(x, y, z), b = cells.get(k) || {count:0,min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
    b.count++;
    [x,y,z].forEach((v,j) => { b.min[j]=Math.min(b.min[j],v); b.max[j]=Math.max(b.max[j],v); });
    cells.set(k,b);
  }
  const changes = [];
  const fitted = boxes.map(box => {
    const [x,y,z] = box.center;
    // Entire cells must be inside the diagnostic ROI; boundary cells stay intact.
    const cellBottom = Math.floor(y/cellSize)*cellSize;
    if (x-cellSize/2 <= -3 || x+cellSize/2 >= 1 || z-cellSize/2 <= 0 || z+cellSize/2 >= 4 ||
        cellBottom < -1.3-1e-9 || cellBottom+cellSize > -.5+1e-9) return box;
    const b = cells.get(key(x,y,z));
    if (!b || b.count<8 || b.max[0]-b.min[0]<cellSize*.5 || b.max[2]-b.min[2]<cellSize*.5) return box;
    const bottom = Math.max(cellBottom,b.min[1]-.005);
    const top = Math.min(cellBottom+cellSize,Math.max(b.max[1]+.005,bottom+.02));
    if (bottom>b.min[1]+1e-9 || top<b.max[1]-1e-9) throw new Error('Observation excluded');
    const result={center:[x,(bottom+top)/2,z],half:[box.half[0],(top-bottom)/2,box.half[2]]};
    changes.push({before:box,after:result,...b});
    return result;
  });
  return {boxes:fitted,changes};
}
