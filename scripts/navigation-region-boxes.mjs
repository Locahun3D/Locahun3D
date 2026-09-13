// Offline broad-phase only: keep full intersecting boxes; never create clipped walkable caps.
export function selectNavigationRegionBoxes(boxes,bounds,padding=.4){
 if(!Array.isArray(bounds)||bounds.length!==2||bounds.some(v=>!Array.isArray(v)||v.length!==3||v.some(n=>!Number.isFinite(n)||Math.abs(n)>10000))||
  bounds[1].some((v,i)=>v<=bounds[0][i])||!Number.isFinite(padding)||padding<.3||padding>2||
  (bounds[1][0]-bounds[0][0])>32||(bounds[1][2]-bounds[0][2])>32)throw Error('Invalid bounded navigation region');
 const selected=[];let visited=0;
 for(const box of boxes){
  if(++visited>500000)throw Error('Offline region scan limit');
  if(!box||!Array.isArray(box.center)||!Array.isArray(box.half)||box.center.length!==3||box.half.length!==3||
   box.center.some(n=>!Number.isFinite(n))||box.half.some(n=>!Number.isFinite(n)||n<=0))throw Error('Invalid source box');
  if(box.center.every((v,i)=>v+box.half[i]>=bounds[0][i]-padding&&v-box.half[i]<=bounds[1][i]+padding)){
   if(selected.length>=100000)throw Error('Navigation region box limit');
   selected.push(box);
  }
 }
 return selected;
}
