<script setup>
import { ref, watch, onMounted } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import axios from 'axios'
import { processGpxDistances, findCoordinateByDistance } from '../composables/useTracker.js'
import planData from '../assets/plan.json'

const props = defineProps({
  activeSegment: {
    type: Object,
    default: null
  }
})

const mapContainer = ref(null)
const map = ref(null)
const gpxData = ref([])

let basePolyline = null
let highlightPolyline = null
let endMarker = null

onMounted(async () => {
  // 대한민국 영역 제한 (남서쪽, 북동쪽 좌표)
  const koreaBounds = L.latLngBounds(
    [33.0, 124.0], // 마라도 부근 남서쪽 끝
    [39.0, 132.0]  // 강원도 북단 북동쪽 끝
  );

  // 원래 100% 잘 작동했던 오픈소스 Leaflet 지도로 복구! + 확대/축소 컨트롤 숨김
  map.value = L.map(mapContainer.value, {
    zoomControl: false,
    maxBounds: koreaBounds, // 이 영역 밖으로 화면을 드래그하지 못하도록 제한
    maxBoundsViscosity: 1.0, // 고무줄처럼 튕기지 않고 단단하게 벽을 형성
    minZoom: 6 // 너무 축소해서 지구가 보이지 않도록(한국만 보이도록) 제한
  }).setView([37.7645, 128.8996], 8)
  
  // 줌 레벨에 따라 마커 이름표(라벨) 숨기기/보이기 로직
  const updateZoomClass = () => {
    if (map.value.getZoom() < 10) {
      mapContainer.value.classList.add('zoom-out')
    } else {
      mapContainer.value.classList.remove('zoom-out')
    }
  }
  map.value.on('zoomend', updateZoomClass)
  updateZoomClass()
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map.value)

  try {
    const fetchAndParseGPX = async (filename) => {
      // vite.config.js의 base 경로(GitHub Pages)를 자동으로 붙여줍니다.
      const baseUrl = import.meta.env.BASE_URL;
      const response = await axios.get(`${baseUrl}${filename}`)
      const parser = new DOMParser()
      const gpx = parser.parseFromString(response.data, 'text/xml')
      const pts = Array.from(gpx.getElementsByTagName('trkpt')).map(pt => [
        parseFloat(pt.getAttribute('lat')),
        parseFloat(pt.getAttribute('lon'))
      ])
      
      // 남에서 북으로 가는 방향이 아니면 뒤집기
      if (pts.length > 1 && pts[0][0] > pts[pts.length - 1][0]) {
        pts.reverse()
      }
      return pts
    }

    const [gbPoints, gwPoints, linkPointsRaw] = await Promise.all([
      fetchAndParseGPX('동해안자전거길(경북).gpx'),
      fetchAndParseGPX('동해안자전거길(강원).gpx'),
      fetchAndParseGPX('3. 울진 숙소-해맞이공원-영덕 터미널.gpx')
    ])
    
    let points = [...gbPoints, ...gwPoints]
    
    // 해맞이공원(36.428434) 보다 아래(남쪽)에 있는 쓸데없는 파란색 경로는 싹둑 잘라냅니다.
    // 배열이 남쪽에서 북쪽으로 향하므로, 위도가 36.428434 이상인 첫 번째 지점을 찾습니다.
    const startIndex = points.findIndex(p => p[0] >= 36.428434)
    if (startIndex !== -1) {
      points = points.slice(startIndex)
    }
    
    // 새로 받은 파일(linkPointsRaw)에서 영덕 터미널 ~ 해맞이공원 구간만 추출!
    let linkPath = []
    const linkStartIdx = linkPointsRaw.findIndex(p => p[0] >= 36.4145) // 영덕터미널 부근
    const linkEndIdx = linkPointsRaw.findIndex(p => p[0] >= 36.428434) // 해맞이공원 부근
    
    if (linkStartIdx !== -1 && linkEndIdx !== -1 && linkStartIdx < linkEndIdx) {
      linkPath = linkPointsRaw.slice(linkStartIdx, linkEndIdx + 1)
    } else {
      // 만약 인덱스로 찾기 애매하면 범위로 강제 필터링
      linkPath = linkPointsRaw.filter(p => p[0] >= 36.4145 && p[0] <= 36.4285)
    }
    
    // 기존의 일직선(직선 2개) 대신, 방금 추출한 꼬불꼬불한 실제 경로를 통째로 맨 앞에 이어 붙입니다.
    points = [...linkPath, ...points]
    
    // 통일전망대(38.515359) 보다 위(북쪽)에 있는 쓸데없는 파란색 꼬리도 잘라냅니다.
    const cutNorthIndex = points.findIndex(p => p[0] > 38.5154)
    if (cutNorthIndex !== -1) {
      points = points.slice(0, cutNorthIndex + 1)
    }
    
    gpxData.value = processGpxDistances(points)

    if (points.length > 0) {
      // 1. 먼저 전체 경로를 옅은 회색으로 깔아줍니다 (아직 좌표가 없는 부분 표시용)
      const fullPolyline = L.polyline(points, {
        color: '#9CA3AF',
        weight: 6,
        opacity: 0.4
      }).addTo(map.value)
      
      // 전체 뷰 맞추기
      map.value.fitBounds(fullPolyline.getBounds(), { paddingBottomRight: [400, 0] })
      
      // 2. 일차(Day)별로 예쁜 색상을 입혀 빈틈없이 전체를 칠합니다.
      const dayColors = ['#EF4444', '#F97316', '#10B981', '#3B82F6', '#8B5CF6']; // 빨, 주, 초, 파, 보
      
      const getDayStartIndex = (dayIdx) => {
        if (dayIdx === 0) {
          // 1일차: 버스 일정이 아닌 첫 자전거 주행의 출발지를 기준점으로 삼습니다.
          const firstBike = planData[0].schedule.find(s => !s.isBus) || planData[0].schedule[0];
          
          // 바로 앞 일정이 버스였다면, 버스의 도착지(lat, lon)가 자전거의 출발지가 됩니다.
          const prevIdx = planData[0].schedule.indexOf(firstBike) - 1;
          const prevBus = prevIdx >= 0 ? planData[0].schedule[prevIdx] : null;
          
          const lat = firstBike.startLat || (prevBus ? prevBus.lat : firstBike.lat);
          const lon = firstBike.startLon || (prevBus ? prevBus.lon : firstBike.lon);
          
          return getClosestPointIndex(lat, lon, gpxData.value);
        }
        // 전날의 일정 중 '좌표가 있는' 가장 마지막 자전거 장소의 인덱스를 오늘의 시작점으로 간주합니다.
        const prevDay = planData[dayIdx - 1];
        const prevValidItem = [...prevDay.schedule].reverse().find(i => i.lat && i.lon && !i.isBus);
        return getClosestPointIndex(prevValidItem.lat, prevValidItem.lon, gpxData.value);
      };

      planData.forEach((day, idx) => {
        const startIndex = getDayStartIndex(idx);
        
        let endIndex;
        if (idx < planData.length - 1) {
          // 다음 날의 시작점이 곧 오늘의 끝점입니다. (빈틈 제거)
          endIndex = getDayStartIndex(idx + 1);
        } else {
          // 마지막 5일차는 무조건 GPX 트랙의 맨 끝(통일전망대)까지 칠합니다.
          endIndex = gpxData.value.length - 1;
        }
        
        const min = Math.min(startIndex, endIndex);
        const max = Math.max(startIndex, endIndex);
        
        const segPoints = gpxData.value.slice(min, max + 1).map(p => [p.lat, p.lon]);
        
        if (segPoints.length > 0) {
          L.polyline(segPoints, {
            color: dayColors[idx % dayColors.length],
            weight: 7, // 줌아웃 했을 때 잘 보이도록 굵기 약간 증가
            opacity: 1
          }).addTo(map.value);
        }
      });
      
      // 마커 생성 유틸 함수 (dayIdx 추가)
      const createMarker = (lat, lon, name, dayIdx) => {
        const certCenters = [
          "해맞이공원", "고래불해변", "월송정", "망양휴게소", "울진은어다리",
          "임원", "한재공원", "추암촛대바위", "망상해변", "정동진", "경포해변",
          "양양지경공원", "동호해변", "영금정(속초)", "봉수대해변", "통일전망대"
        ];
        
        const dayBgColors = ['bg-red-500', 'bg-orange-500', 'bg-green-500', 'bg-blue-500', 'bg-purple-500'];
        const dayBorderColors = ['border-red-500', 'border-orange-500', 'border-green-500', 'border-blue-500', 'border-purple-500'];
        const dayTextColors = ['text-red-900', 'text-orange-900', 'text-green-900', 'text-blue-900', 'text-purple-900'];
        
        const bgColor = dayBgColors[dayIdx % dayBgColors.length];
        const borderColor = dayBorderColors[dayIdx % dayBorderColors.length];
        const textColor = dayTextColors[dayIdx % dayTextColors.length];

        const isCert = certCenters.includes(name);
        const stampSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 mr-1 text-red-600 inline-block shrink-0 -mt-0.5"><path fill-rule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 11.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clip-rule="evenodd" /></svg>`;
        const displayName = isCert ? `${stampSvg}${name}` : name;
        
        const icon = L.divIcon({
          className: 'custom-div-icon',
          html: `<div class="flex items-center" style="width: max-content;">
                   <div class="w-4 h-4 ${bgColor} rounded-full border-2 border-white shadow-sm shrink-0"></div>
                   <div class="marker-label bg-white/95 backdrop-blur-md border-2 ${borderColor} ${textColor} font-extrabold px-3 py-1.5 rounded-lg shadow-md whitespace-nowrap text-sm ml-2 flex items-center">
                     ${displayName}
                   </div>
                 </div>`,
          iconAnchor: [8, 8]
        })
        L.marker([lat, lon], { icon }).addTo(map.value)
      }

      // 1. 첫 출발지 마커 (1일차 시작이므로 dayIdx = 0)
      if (planData.length > 0 && planData[0].schedule.length > 0) {
        const first = planData[0].schedule[0]
        if (first.startLat && first.startLon) createMarker(first.startLat, first.startLon, first.from, 0)
      }

      // 2. 엑셀 기반 정확한 위치 마커
      planData.forEach((day, dayIdx) => {
        day.schedule.forEach(item => {
          if (item.lat && item.lon) createMarker(item.lat, item.lon, item.to, dayIdx)
        })
      })

      // =========================================================================
      // [타임라인 고스트 라이더 기능]
      // 시작일(1일차)을 '어제'로 가정하고, 현재 시간에 맞춰 예상 위치를 계산합니다.
      // =========================================================================
      let ghostMarker = null;
      
      const updateGhostRider = () => {
        if (!map.value || gpxData.value.length === 0) return;

        const now = new Date();
        // 실제 출발 예정일인 5월 1일을 1일차(시작일)로 설정
        const startDate = new Date(now.getFullYear(), 4, 1); // 4는 5월(Month는 0부터 시작), 1은 1일
        startDate.setHours(0, 0, 0, 0);

        let targetLat = null;
        let targetLon = null;
        let isMoving = false;

        for (let dayIdx = 0; dayIdx < planData.length; dayIdx++) {
          const dayPlan = planData[dayIdx];
          
          const currentDayDate = new Date(startDate);
          currentDayDate.setDate(currentDayDate.getDate() + dayIdx);
          
          // yyyy-mm-dd (로컬 타임존 기준 안전한 변환)
          const year = currentDayDate.getFullYear();
          const month = String(currentDayDate.getMonth() + 1).padStart(2, '0');
          const day = String(currentDayDate.getDate()).padStart(2, '0');
          const dateStr = `${year}-${month}-${day}`;

          for (let i = 0; i < dayPlan.schedule.length; i++) {
            const item = dayPlan.schedule[i];
            const itemStart = new Date(`${dateStr}T${item.startTime}`);
            const itemEnd = new Date(`${dateStr}T${item.endTime}`);

            if (now < itemStart) {
              // 현재 시간이 이 일정 시작 전이라면, 이전 목적지에 머물러 있는 상태
              if (i > 0) {
                targetLat = dayPlan.schedule[i-1].lat;
                targetLon = dayPlan.schedule[i-1].lon;
              } else if (dayIdx > 0) {
                const prevDay = planData[dayIdx-1];
                const lastItem = prevDay.schedule[prevDay.schedule.length - 1];
                targetLat = lastItem.lat;
                targetLon = lastItem.lon;
              } else {
                targetLat = item.startLat || item.lat;
                targetLon = item.startLon || item.lon;
              }
              break; // 현재 머물고 있는 곳을 찾았으므로 탈출
            } else if (now >= itemStart && now <= itemEnd) {
              // 현재 주행(이동) 중인 상태!
              isMoving = true;
              const totalMs = itemEnd.getTime() - itemStart.getTime();
              const elapsedMs = now.getTime() - itemStart.getTime();
              const ratio = elapsedMs / totalMs; // 0.0 ~ 1.0 (진척도)
              
              let sLat, sLon;
              if (i > 0) {
                sLat = dayPlan.schedule[i-1].lat;
                sLon = dayPlan.schedule[i-1].lon;
              } else if (dayIdx > 0) {
                const prevDay = planData[dayIdx-1];
                const lastItem = prevDay.schedule[prevDay.schedule.length - 1];
                sLat = lastItem.lat;
                sLon = lastItem.lon;
              } else {
                sLat = item.startLat || item.lat;
                sLon = item.startLon || item.lon;
              }

              if (item.isBus) {
                // 버스 구간은 두 지점 사이를 직선으로 보간 (Interpolation)
                targetLat = sLat + (item.lat - sLat) * ratio;
                targetLon = sLon + (item.lon - sLon) * ratio;
              } else {
                // 자전거 구간은 GPX 경로 상의 점들을 따라 보간
                const startIdx = getClosestPointIndex(sLat, sLon, gpxData.value);
                const endIdx = getClosestPointIndex(item.lat, item.lon, gpxData.value);
                
                if (startIdx > endIdx) {
                  const cIdx = startIdx - Math.floor((startIdx - endIdx) * ratio);
                  targetLat = gpxData.value[cIdx].lat;
                  targetLon = gpxData.value[cIdx].lon;
                } else {
                  const cIdx = startIdx + Math.floor((endIdx - startIdx) * ratio);
                  targetLat = gpxData.value[cIdx].lat;
                  targetLon = gpxData.value[cIdx].lon;
                }
              }
              break; // 주행 중인 위치를 찾았으므로 탈출
            }
          }
          if (targetLat !== null) break; // 일 단위 루프도 탈출
        }

        // 만약 모든 일정이 다 끝났을 경우 (마지막 날 마지막 일정 이후 시간)
        if (targetLat === null) {
          const lastDay = planData[planData.length - 1];
          const lastItem = lastDay.schedule[lastDay.schedule.length - 1];
          targetLat = lastItem.lat;
          targetLon = lastItem.lon;
        }

        // 고스트 아이콘 생성 (이동 중일 땐 위아래로 바운스, 정지해 있을 땐 가만히)
        const ghostIcon = L.divIcon({
          className: 'custom-div-icon',
          html: `<div class="relative w-12 h-12 flex items-center justify-center pointer-events-none">
                   <div class="absolute inset-0 bg-purple-500/30 rounded-full animate-ping"></div>
                   <div class="relative bg-white/95 backdrop-blur-md p-2 rounded-full border-2 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.5)] z-20 ${isMoving ? 'animate-bounce' : ''}">
                     <span class="text-xl drop-shadow-sm">👻</span>
                   </div>
                   <div class="absolute top-[46px] whitespace-nowrap bg-purple-600 text-white text-[11px] font-bold px-2 py-0.5 rounded shadow-md z-30 opacity-90 tracking-tight">
                     예상 현재 위치
                   </div>
                 </div>`,
          iconSize: [48, 48],
          iconAnchor: [24, 24]
        });

        if (ghostMarker) {
          ghostMarker.setLatLng([targetLat, targetLon]);
          ghostMarker.setIcon(ghostIcon);
        } else {
          ghostMarker = L.marker([targetLat, targetLon], { icon: ghostIcon, zIndexOffset: 2000 }).addTo(map.value);
        }
      };

      // 렌더링 즉시 한 번 계산하고, 이후 5초마다 위치 갱신
      updateGhostRider();
      setInterval(updateGhostRider, 5000);
    }
  } catch (error) {
    console.error('GPX 파싱 에러:', error)
  }
})

// 지정된 위도/경도와 가장 가까운 GPX 지점의 인덱스를 찾는 함수
const getClosestPointIndex = (targetLat, targetLon, pointsArray) => {
  let minDist = Infinity;
  let closestIdx = 0;
  for (let i = 0; i < pointsArray.length; i++) {
    const p = pointsArray[i];
    // 간단한 유클리드 거리 제곱 (자전거길 수준의 좁은 범위에서는 충분히 정확함)
    const dist = Math.pow(p.lat - targetLat, 2) + Math.pow(p.lon - targetLon, 2);
    if (dist < minDist) {
      minDist = dist;
      closestIdx = i;
    }
  }
  return closestIdx;
}

// 현재 위치 트래킹 변수
let userLocationMarker = null;
let userLocationCircle = null;
let watchId = null;
const isTracking = ref(false);

const toggleLocationTracking = () => {
  if (!navigator.geolocation) {
    alert("현재 기기/브라우저에서는 위치 정보를 지원하지 않습니다.");
    return;
  }

  if (isTracking.value) {
    // 트래킹 끄기
    navigator.geolocation.clearWatch(watchId);
    isTracking.value = false;
    if (userLocationMarker) {
      map.value.removeLayer(userLocationMarker);
      userLocationMarker = null;
    }
    if (userLocationCircle) {
      map.value.removeLayer(userLocationCircle);
      userLocationCircle = null;
    }
    return;
  }

  // 트래킹 켜기
  isTracking.value = true;
  let isFirstTime = true;

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      
      if (!map.value) return;

      if (!userLocationMarker) {
        // SVG 자전거 아이콘 경로 (Material Design)
        const bikePath = "M15.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM5 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5zm5.8-10l2.4-2.4.8.8c1.3 1.3 3 2.1 5.1 2.1V9c-1.5 0-2.7-.6-3.6-1.5l-1.9-1.9c-.5-.4-1-.6-1.6-.6s-1.1.2-1.4.6L7.8 8.4c-.4.4-.6.9-.6 1.4 0 .6.2 1.1.6 1.4L11 14v5h2v-6.2l-2.2-2.3zM19 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5z";
        
        // 1명의 자전거 라이더를 나타내는 SVG 마커
        const pulseIcon = L.divIcon({
          className: 'custom-div-icon',
          html: `<div class="relative flex flex-col items-center justify-center">
                   <!-- 통통 튀는 라이더 아이콘 -->
                   <div class="bg-white/95 backdrop-blur-md p-1.5 rounded-full shadow-xl border-2 border-blue-500 z-10 -translate-y-2 animate-bounce">
                     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-7 h-7 text-blue-600"><path d="${bikePath}"/></svg>
                   </div>
                   <!-- 바닥에 찍히는 정확한 위치점과 퍼지는 파동 -->
                   <span class="animate-ping absolute bottom-0 inline-flex h-8 w-8 rounded-full bg-blue-400 opacity-75"></span>
                   <span class="absolute bottom-2.5 inline-flex rounded-full h-3 w-3 bg-blue-600 border-2 border-white shadow-sm"></span>
                 </div>`,
          iconSize: [60, 60],
          iconAnchor: [30, 60] // 아이콘의 제일 하단 중앙이 실제 좌표에 맞물리도록 앵커 설정
        });

        userLocationMarker = L.marker([lat, lon], { icon: pulseIcon, zIndexOffset: 1000 }).addTo(map.value);
        
        userLocationCircle = L.circle([lat, lon], {
          radius: position.coords.accuracy / 2,
          color: '#3B82F6',
          fillColor: '#3B82F6',
          fillOpacity: 0.1,
          weight: 1
        }).addTo(map.value);
      } else {
        // 기존 마커 업데이트
        userLocationMarker.setLatLng([lat, lon]);
        userLocationCircle.setLatLng([lat, lon]);
        userLocationCircle.setRadius(position.coords.accuracy / 2);
      }

      // 최초 1회만 카메라를 내 위치로 부드럽게 이동 (이후엔 유저가 맵을 움직일 수 있도록 방해 안 함)
      if (isFirstTime) {
        const zoomLevel = 15;
        const targetLatLng = L.latLng(lat, lon);
        const targetPoint = map.value.project(targetLatLng, zoomLevel);
        targetPoint.x += 200; // 우측 패널(약 400px)을 피해 시각적 중앙으로 보정
        const offsetLatLng = map.value.unproject(targetPoint, zoomLevel);

        map.value.setView(offsetLatLng, zoomLevel, { animate: true, duration: 0.5 });
        isFirstTime = false;
      }
    },
    (error) => {
      console.error("GPS 에러:", error);
      alert("위치 정보를 가져올 수 없습니다. 기기의 GPS가 켜져있는지, 브라우저의 위치 권한을 허용했는지 확인해주세요.");
      isTracking.value = false;
    },
    {
      enableHighAccuracy: true, // 배터리를 조금 더 쓰더라도 GPS를 정확하게
      timeout: 10000,
      maximumAge: 0
    }
  );
}

// 구간 또는 장소 선택 시 동작 분기
watch(() => props.activeSegment, (action) => {
  if (!action) return;

  if (highlightPolyline) map.value.removeLayer(highlightPolyline)

  // 1. 노드(장소 이름)를 클릭했을 때 -> 카메라만 스르륵 이동
  if (action.type === 'node') {
    if (action.lat && action.lon) {
      const zoomLevel = 14;
      const targetLatLng = L.latLng(action.lat, action.lon);
      
      // 우측에 떠있는 패널(약 400px) 때문에 타겟이 패널에 가려지거나 치우쳐 보임.
      // 시각적인 중앙에 맞추기 위해 줌 레벨 기준 픽셀 좌표계로 변환 후 오른쪽으로 200px 중심 이동.
      const targetPoint = map.value.project(targetLatLng, zoomLevel);
      targetPoint.x += 200; // 패널 너비의 절반만큼 x축 보정
      
      const offsetLatLng = map.value.unproject(targetPoint, zoomLevel);

      map.value.setView(offsetLatLng, zoomLevel, {
        animate: true,
        duration: 0.4
      })
    } else {
      console.warn("선택한 항목에 lat, lon 정보가 없습니다.")
    }
  } 
  // 2. 엣지(이동 구간 박스)를 클릭했을 때 -> 해당 구간에 동적 하이라이트 선 긋기
  else if (action.type === 'edge') {
    if (action.startLat && action.startLon && action.endLat && action.endLon) {
      
      const isMobile = window.innerWidth < 640;
      const rootStyle = getComputedStyle(document.documentElement);
      const panelVh = parseFloat(rootStyle.getPropertyValue('--panel-height')) || 55;
      const panelPx = isMobile ? (window.innerHeight * panelVh / 100) : 0;
      
      const padTopLeft = isMobile ? [30, 30] : [80, 80];
      const padBottomRight = [
        isMobile ? 30 : 480, 
        isMobile ? panelPx + 30 : 80 
      ];
      
      const dayBorderColors = ['#EF4444', '#F97316', '#22C55E', '#3B82F6', '#A855F7'];
      const routeColor = action.dayIdx !== undefined ? dayBorderColors[action.dayIdx % dayBorderColors.length] : '#F59E0B';

      // 버스 등 이동수단 탑승 구간: 직선으로 표시
      if (action.isBus) {
        const segPoints = [
          [action.startLat, action.startLon],
          [action.endLat, action.endLon]
        ]
        
        highlightPolyline = L.polyline(segPoints, {
          color: routeColor,
          weight: 6,
          opacity: 0.8,
          className: 'animated-route bus-route',
          lineCap: 'round',
          dashArray: '10 15' // 버스는 점선을 좀 더 다르게 표시
        }).addTo(map.value)
        
        map.value.fitBounds(highlightPolyline.getBounds(), { 
          paddingTopLeft: padTopLeft,
          paddingBottomRight: padBottomRight,
          maxZoom: 10, // 거리가 멀어 너무 줌인되지 않도록 더 넉넉하게
          animate: true,
          duration: 0.5
        })
      } 
      // 자전거 주행 구간: GPX 선에 맞춰서 표시
      else if (gpxData.value.length > 0) {
        const startIndex = getClosestPointIndex(action.startLat, action.startLon, gpxData.value);
        const endIndex = getClosestPointIndex(action.endLat, action.endLon, gpxData.value);
        
        const min = Math.min(startIndex, endIndex)
        const max = Math.max(startIndex, endIndex)
        
        const segPoints = gpxData.value.slice(min, max + 1).map(p => [p.lat, p.lon])
        
        if (segPoints.length > 0) {
          highlightPolyline = L.polyline(segPoints, {
            color: routeColor,
            weight: 10,
            opacity: 1,
            className: 'animated-route',
            lineCap: 'round',
            lineJoin: 'round'
          }).addTo(map.value)
          
          map.value.fitBounds(highlightPolyline.getBounds(), { 
            paddingTopLeft: padTopLeft,
            paddingBottomRight: padBottomRight,
            maxZoom: 14,
            animate: true,
            duration: 0.5
          })
        }
      }
    } else {
      console.warn("출발지 또는 도착지 좌표가 명확하지 않아 경로를 그릴 수 없습니다.")
    }
  }
  // 3. 일차(Day) 탭을 변경했을 때 -> 해당 일차 전체 구간이 보이도록 지도 카메라만 이동
  else if (action.type === 'day') {
    if (gpxData.value.length > 0) {
      if (action.startLat && action.startLon && action.endLat && action.endLon) {
        const startIndex = getClosestPointIndex(action.startLat, action.startLon, gpxData.value);
        const endIndex = getClosestPointIndex(action.endLat, action.endLon, gpxData.value);
        
        const min = Math.min(startIndex, endIndex)
        const max = Math.max(startIndex, endIndex)
        
        const segPoints = gpxData.value.slice(min, max + 1).map(p => [p.lat, p.lon])
        
        if (segPoints.length > 0) {
          // 화면 계산용 투명 폴리라인 (실제 렌더링되진 않으나 Bounds 계산용)
          const tempPolyline = L.polyline(segPoints, { opacity: 0 });
          
          const isMobile = window.innerWidth < 640;
          const rootStyle = getComputedStyle(document.documentElement);
          const panelVh = parseFloat(rootStyle.getPropertyValue('--panel-height')) || 55;
          const panelPx = isMobile ? (window.innerHeight * panelVh / 100) : 0;
          
          const padTopLeft = isMobile ? [30, 30] : [80, 80];
          const padBottomRight = [
            isMobile ? 30 : 480,
            isMobile ? panelPx + 30 : 80
          ];
          
          map.value.fitBounds(tempPolyline.getBounds(), { 
            paddingTopLeft: padTopLeft,
            paddingBottomRight: padBottomRight,
            maxZoom: 12, // 하루 전체 코스이므로 한눈에 보이게 줌 제한
            animate: true,
            duration: 0.6
          })
        }
      }
    }
  }
})
</script>

<template>
  <div class="absolute inset-0 w-full h-full">
    <!-- 지도 컨테이너 -->
    <div id="map" ref="mapContainer" class="absolute inset-0 z-0"></div>
    
    <!-- 인증센터 범례 (Legend) 모바일 숨김 -->
    <div class="dynamic-bottom absolute left-4 sm:left-8 z-[1000] bg-white/95 backdrop-blur-md px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl shadow-lg border border-gray-200 hidden sm:flex items-center pointer-events-none transition-all duration-75">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 sm:w-5 sm:h-5 text-red-600 mr-1.5 sm:mr-2 shrink-0">
        <path fill-rule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 11.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clip-rule="evenodd" />
      </svg>
      <span class="text-gray-800 font-extrabold text-xs sm:text-sm tracking-tight">인증센터 위치</span>
    </div>

    <!-- GPS 내 위치 추적 버튼 -->
    <button @click="toggleLocationTracking" 
            :class="['dynamic-bottom absolute right-4 sm:right-[420px] z-[1000] p-3 sm:p-3.5 rounded-2xl shadow-xl backdrop-blur-md transition-all duration-75 flex items-center justify-center group border', 
                     isTracking ? 'bg-blue-600 text-white border-blue-500 shadow-blue-500/30' : 'bg-white/95 text-gray-700 border-gray-200 hover:bg-gray-50']" 
            title="내 위치 실시간 추적">
      <svg v-if="!isTracking" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 sm:w-6 sm:h-6 group-hover:scale-110 transition-transform">
        <path fill-rule="evenodd" d="M11.5 2.25a.75.75 0 0 1 .75.75v2.54a8.25 8.25 0 0 1 6.96 6.96h2.54a.75.75 0 0 1 0 1.5h-2.54a8.25 8.25 0 0 1-6.96 6.96v2.54a.75.75 0 0 1-1.5 0v-2.54a8.25 8.25 0 0 1-6.96-6.96H1.25a.75.75 0 0 1 0-1.5h2.54a8.25 8.25 0 0 1 6.96-6.96V3a.75.75 0 0 1 .75-.75Zm0 4.5a.75.75 0 0 1 .75.75v1.25a5.25 5.25 0 0 1 3.5 3.5h1.25a.75.75 0 0 1 0 1.5h-1.25a5.25 5.25 0 0 1-3.5 3.5v1.25a.75.75 0 0 1-1.5 0v-1.25a5.25 5.25 0 0 1-3.5-3.5H4.5a.75.75 0 0 1 0-1.5h1.25a5.25 5.25 0 0 1 3.5-3.5V7.5a.75.75 0 0 1 .75-.75Z" clip-rule="evenodd" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
      <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 sm:w-6 sm:h-6 animate-pulse">
        <path fill-rule="evenodd" d="M11.5 2.25a.75.75 0 0 1 .75.75v2.54a8.25 8.25 0 0 1 6.96 6.96h2.54a.75.75 0 0 1 0 1.5h-2.54a8.25 8.25 0 0 1-6.96 6.96v2.54a.75.75 0 0 1-1.5 0v-2.54a8.25 8.25 0 0 1-6.96-6.96H1.25a.75.75 0 0 1 0-1.5h2.54a8.25 8.25 0 0 1 6.96-6.96V3a.75.75 0 0 1 .75-.75Zm0 4.5a.75.75 0 0 1 .75.75v1.25a5.25 5.25 0 0 1 3.5 3.5h1.25a.75.75 0 0 1 0 1.5h-1.25a5.25 5.25 0 0 1-3.5 3.5v1.25a.75.75 0 0 1-1.5 0v-1.25a5.25 5.25 0 0 1-3.5-3.5H4.5a.75.75 0 0 1 0-1.5h1.25a5.25 5.25 0 0 1 3.5-3.5V7.5a.75.75 0 0 1 .75-.75Z" clip-rule="evenodd" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    </button>
  </div>
</template>
<style scoped>
.dynamic-bottom {
  bottom: calc(var(--panel-height, 55vh) + 16px);
}

@media (min-width: 640px) {
  .dynamic-bottom {
    bottom: 2rem !important; /* sm:bottom-8 */
  }
}

/* Leaflet의 기본 background가 흰색이므로 자전거길과 어울리게 설정 */
:deep(.leaflet-container) {
  background-color: #eef1e8;
  font-family: inherit;
}
:deep(.custom-div-icon) {
  background: transparent;
  border: none;
}

/* 동적 선 애니메이션 (흐르는 점선 효과) */
@keyframes flow {
  to {
    stroke-dashoffset: -40;
  }
}

:deep(.animated-route) {
  stroke-dasharray: 20 20;
  animation: flow 0.5s linear infinite;
  filter: drop-shadow(0 0 5px rgba(0,0,0,0.4)); /* 너무 부담스럽지 않게 은은한 그림자 */
}

/* 줌 아웃 시 마커 라벨 숨기기 애니메이션 */
:deep(.marker-label) {
  transition: opacity 0.25s ease, transform 0.25s ease;
  transform-origin: left center;
}
.zoom-out :deep(.marker-label) {
  opacity: 0;
  pointer-events: none;
  transform: scale(0.8) translateX(-5px);
}
</style>
