// 두 위경도 좌표 사이의 거리를 km 단위로 계산하는 함수 (Haversine 공식)
export function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // 지구 반지름 (km)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// 1. GPX 좌표 배열을 받아서, 출발점으로부터의 '누적 거리(cumulative)'를 입힌 새로운 배열을 반환합니다.
export function processGpxDistances(points) {
  let totalDistance = 0;
  const processed = [];
  
  if (points.length === 0) return processed;
  
  // 첫 번째 지점
  processed.push({ lat: points[0][0], lon: points[0][1], cumulative: 0 });
  
  // 두 번째 지점부터 거리 누적
  for (let i = 1; i < points.length; i++) {
    const prev = points[i-1];
    const curr = points[i];
    const dist = getDistance(prev[0], prev[1], curr[0], curr[1]);
    totalDistance += dist;
    
    processed.push({ 
      lat: curr[0], 
      lon: curr[1], 
      cumulative: totalDistance 
    });
  }
  
  return processed;
}

// 2. 목표 거리(targetDistance)를 주면, GPX 배열에서 가장 가까운 위경도 좌표를 찾아줍니다.
export function findCoordinateByDistance(processedPoints, targetDistance) {
  if (!processedPoints || processedPoints.length === 0) return null;
  if (targetDistance <= 0) return processedPoints[0];
  
  for (let i = 0; i < processedPoints.length; i++) {
    if (processedPoints[i].cumulative >= targetDistance) {
      return processedPoints[i];
    }
  }
  
  // 거리가 범위를 초과하면 가장 마지막 지점 반환
  return processedPoints[processedPoints.length - 1];
}
