<script setup>
import { ref, watch } from 'vue'
import planData from '../assets/plan.json'

const activeTab = ref('plan')
const selectedDayIdx = ref(0) // 0: 1일차, 1: 2일차...

const panelHeight = ref(55) // 초기 높이 (vh)
let startY = 0
let startHeight = 0

const startDrag = (e) => {
  if (window.innerWidth >= 640) return // 데스크탑에서는 리사이징 비활성
  
  const clientY = e.touches ? e.touches[0].clientY : e.clientY
  startY = clientY
  startHeight = panelHeight.value
  
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('touchmove', onDrag, { passive: false })
  document.addEventListener('mouseup', stopDrag)
  document.addEventListener('touchend', stopDrag)
}

const onDrag = (e) => {
  const clientY = e.touches ? e.touches[0].clientY : e.clientY
  const deltaY = startY - clientY
  
  // 화면 픽셀 이동량을 vh 단위로 변환
  const vhDelta = (deltaY / window.innerHeight) * 100
  let newHeight = startHeight + vhDelta
  
  // 최소 15vh, 최대 90vh 로 제한
  if (newHeight < 15) newHeight = 15
  if (newHeight > 90) newHeight = 90
  
  panelHeight.value = newHeight
}

const stopDrag = () => {
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('touchmove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.removeEventListener('touchend', stopDrag)
}

// CSS 변수로 등록해서 다른 컴포넌트(지도 버튼 등)에서도 높이를 알 수 있게 함
watch(panelHeight, (newVal) => {
  document.documentElement.style.setProperty('--panel-height', newVal + 'vh')
}, { immediate: true })

const emit = defineEmits(['selectSegment'])

// 일차(Day) 서브 탭이 변경될 때, 해당 일차의 전체 구간을 지도에서 보여주기 위한 이벤트 전송
watch(selectedDayIdx, (newIdx) => {
  const dayPlan = planData[newIdx]
  if (dayPlan && dayPlan.schedule.length > 0) {
    // 서울-영덕 버스 같은 이동 구간을 제외하고, 실제 자전거 주행이 시작되는 항목을 찾습니다.
    const firstBike = dayPlan.schedule.find(s => !s.isBus) || dayPlan.schedule[0]
    const itemIdx = dayPlan.schedule.indexOf(firstBike)
    
    // 해당 주행 코스의 출발지 좌표 
    const startCoord = getStartCoordinate(newIdx, itemIdx)
    const endItem = dayPlan.schedule[dayPlan.schedule.length - 1]
    
    emit('selectSegment', {
      type: 'day',
      dayIdx: newIdx,
      startLat: startCoord.lat,
      startLon: startCoord.lon,
      endLat: endItem.lat,
      endLon: endItem.lon
    })
  }
})

const getStartCoordinate = (dayIdx, itemIdx) => {
  if (itemIdx > 0) {
    const prevItem = planData[dayIdx].schedule[itemIdx - 1]
    return { lat: prevItem.lat, lon: prevItem.lon }
  } else if (dayIdx > 0) {
    const prevDaySchedule = planData[dayIdx - 1].schedule
    const prevItem = prevDaySchedule[prevDaySchedule.length - 1]
    return { lat: prevItem.lat, lon: prevItem.lon }
  } else {
    const item = planData[0].schedule[0]
    return { lat: item.startLat, lon: item.startLon }
  }
}

const isCertCenter = (name) => {
  return [
    "해맞이공원", "고래불해변", "월송정", "망양휴게소", "울진은어다리",
    "임원", "한재공원", "추암촛대바위", "망상해변", "정동진", "경포해변",
    "양양지경공원", "동호해변", "영금정(속초)", "봉수대해변", "통일전망대"
  ].includes(name);
}

// 지도와 동일한 테마 색상 (빨, 주, 초, 파, 보)
const dayTheme = [
  { text: 'text-red-700', bg: 'bg-red-50', line: 'before:bg-red-300', dot: 'border-red-500', hoverText: 'group-hover:text-red-600', hoverBorder: 'hover:border-red-400 group-hover:border-red-400', edgeBg: 'bg-red-50/60', badgeBg: 'bg-red-100', badgeText: 'text-red-800' },
  { text: 'text-orange-700', bg: 'bg-orange-50', line: 'before:bg-orange-300', dot: 'border-orange-500', hoverText: 'group-hover:text-orange-600', hoverBorder: 'hover:border-orange-400 group-hover:border-orange-400', edgeBg: 'bg-orange-50/60', badgeBg: 'bg-orange-100', badgeText: 'text-orange-800' },
  { text: 'text-green-700', bg: 'bg-green-50', line: 'before:bg-green-300', dot: 'border-green-500', hoverText: 'group-hover:text-green-600', hoverBorder: 'hover:border-green-400 group-hover:border-green-400', edgeBg: 'bg-green-50/60', badgeBg: 'bg-green-100', badgeText: 'text-green-800' },
  { text: 'text-blue-700', bg: 'bg-blue-50', line: 'before:bg-blue-300', dot: 'border-blue-500', hoverText: 'group-hover:text-blue-600', hoverBorder: 'hover:border-blue-400 group-hover:border-blue-400', edgeBg: 'bg-blue-50/60', badgeBg: 'bg-blue-100', badgeText: 'text-blue-800' },
  { text: 'text-purple-700', bg: 'bg-purple-50', line: 'before:bg-purple-300', dot: 'border-purple-500', hoverText: 'group-hover:text-purple-600', hoverBorder: 'hover:border-purple-400 group-hover:border-purple-400', edgeBg: 'bg-purple-50/60', badgeBg: 'bg-purple-100', badgeText: 'text-purple-800' },
];
</script>

<template>
  <div class="responsive-panel absolute bottom-0 left-0 w-full sm:top-0 sm:right-0 sm:left-auto sm:w-96 bg-white/95 backdrop-blur-xl shadow-[0_-10px_40px_rgba(0,0,0,0.15)] sm:shadow-[-10px_0_30px_rgba(0,0,0,0.15)] overflow-y-auto z-[1000] flex flex-col border-t sm:border-t-0 sm:border-l border-white/60 rounded-t-3xl sm:rounded-none">
    
    <!-- 모바일 드래그 핸들 -->
    <div class="w-full flex justify-center py-3 cursor-grab active:cursor-grabbing sm:hidden shrink-0 sticky top-0 bg-white/95 backdrop-blur-md z-30"
         @mousedown="startDrag"
         @touchstart.passive="startDrag">
      <div class="w-12 h-1.5 bg-gray-300 rounded-full"></div>
    </div>

    <!-- 상단 헤더 & 탭 -->
    <div class="px-5 pb-5 sm:p-6 sticky top-[30px] sm:top-0 bg-white/95 backdrop-blur-md z-20 border-b border-gray-200 shadow-sm flex flex-col gap-4">
      <div>
        <h2 class="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">종주 계획표</h2>
        <p class="text-sm sm:text-base font-semibold text-gray-600 mt-1 sm:mt-2">4박 5일 코스</p>
      </div>
      
      <!-- 메인 탭 메뉴 (계획표/맛집) -->
      <div class="flex p-1 bg-gray-100/80 rounded-xl">
        <button @click="activeTab = 'plan'" :class="['flex-1 py-2 text-sm font-bold rounded-lg transition-all', activeTab === 'plan' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700']">
          📅 계획표
        </button>
        <button @click="activeTab = 'food'" :class="['flex-1 py-2 text-sm font-bold rounded-lg transition-all', activeTab === 'food' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700']">
          🍔 맛집 리스트
        </button>
      </div>

      <!-- 세부 항목 (일차 선택 서브 탭) -->
      <div class="flex gap-2 overflow-x-auto scrollbar-hide snap-x pb-1 -mb-1">
        <button v-for="(dayObj, idx) in planData" :key="idx" 
                @click="selectedDayIdx = idx"
                :class="['shrink-0 px-4 py-1.5 rounded-full text-sm font-bold border transition-all snap-start',
                         selectedDayIdx === idx 
                           ? `${dayTheme[idx].bg} ${dayTheme[idx].text} ${dayTheme[idx].dot.replace('border-','border-')} shadow-sm` 
                           : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50']">
          {{ idx + 1 }}일차
        </button>
      </div>
    </div>
    
    <!-- 일정 리스트 (계획표 탭) -->
    <div v-show="activeTab === 'plan'" class="p-5 sm:p-6 space-y-10">
      <div v-for="(dayPlan, dayIdx) in planData" :key="dayIdx" v-show="selectedDayIdx === dayIdx" class="relative">
        
        <h3 :class="['text-xl font-black mb-6 sticky top-[105px] z-10 bg-white/95 py-2 rounded-md px-2 backdrop-blur-md inline-block shadow-sm border border-gray-100', dayTheme[dayIdx].text]">
          📅 {{ dayPlan.day }}
        </h3>
        
        <div :class="['relative before:absolute before:inset-0 before:ml-[11px] before:h-full before:w-[3px]', dayTheme[dayIdx].line]">
          
          <!-- 하루의 첫 출발지 (Node) -->
          <div v-if="dayPlan.schedule.length > 0" 
               class="relative flex items-center gap-4 py-1 cursor-pointer group"
               @click="dayPlan.schedule[0].startLat ? $emit('selectSegment', {type: 'node', lat: dayPlan.schedule[0].startLat, lon: dayPlan.schedule[0].startLon}) : null">
            <div :class="['w-6 h-6 rounded-full bg-white border-[5px] shadow-sm z-10 shrink-0 group-hover:scale-125 transition-all', dayTheme[dayIdx].dot, dayTheme[dayIdx].hoverBorder]"></div>
            <span :class="['text-xl font-black text-gray-800 transition-colors inline-flex items-center', dayTheme[dayIdx].hoverText]">
              <svg v-if="isCertCenter(dayPlan.schedule[0].from)" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 mr-1 text-red-600 shrink-0">
                <path fill-rule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 11.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clip-rule="evenodd" />
              </svg>
              {{ dayPlan.schedule[0].from }}
            </span>
          </div>

          <template v-for="(item, idx) in dayPlan.schedule" :key="idx">
            
            <!-- 이동 구간 정보 카드 (Edge) -->
            <div class="relative flex items-start gap-4 py-3 pl-12 pr-2 cursor-pointer group"
                 @click="$emit('selectSegment', {
                   type: 'edge', 
                   startLat: getStartCoordinate(dayIdx, idx).lat,
                   startLon: getStartCoordinate(dayIdx, idx).lon,
                   endLat: item.lat,
                   endLon: item.lon,
                   dayIdx: dayIdx,
                   isBus: item.isBus
                 })">
              <div :class="['flex-1 p-4 rounded-2xl border border-gray-100 shadow-sm group-hover:shadow-md transition-all', dayTheme[dayIdx].edgeBg, dayTheme[dayIdx].hoverBorder]">
                
                <div class="flex justify-between items-center mb-2">
                  <span class="text-sm font-bold text-gray-600 bg-white px-2 py-1 rounded-md border border-gray-200 shadow-sm">
                    🕒 {{ item.startTime.substring(0,5) }} ~ {{ item.endTime.substring(0,5) }}
                  </span>
                  <span :class="['text-sm font-black px-3 py-1 rounded-full shadow-sm border border-white/50', dayTheme[dayIdx].badgeBg, dayTheme[dayIdx].badgeText]">
                    {{ item.distance }}km
                  </span>
                </div>
                
                <div class="text-sm font-semibold text-gray-500 mb-3 ml-1">
                  📈 누적: <span class="text-gray-700">{{ item.cumulative }}km</span>
                </div>
                
                <p v-if="item.note" class="text-sm text-blue-800 bg-white/70 p-3 rounded-xl font-bold border border-white shadow-inner">
                  💡 {{ item.note }}
                </p>
              </div>
            </div>

            <!-- 도착지 (Node) -->
            <div class="relative flex items-center gap-4 py-1 cursor-pointer group" @click="$emit('selectSegment', {type: 'node', lat: item.lat, lon: item.lon})">
              <div :class="['w-6 h-6 rounded-full bg-white border-[5px] shadow-sm z-10 shrink-0 group-hover:scale-125 transition-all', dayTheme[dayIdx].dot, dayTheme[dayIdx].hoverBorder]"></div>
              <span :class="['text-xl font-black text-gray-800 transition-colors inline-flex items-center', dayTheme[dayIdx].hoverText]">
                <svg v-if="isCertCenter(item.to)" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 mr-1 text-red-600 shrink-0">
                  <path fill-rule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 11.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clip-rule="evenodd" />
                </svg>
                {{ item.to }}
              </span>
            </div>

          </template>
        </div>
      </div>
    </div>

    <!-- 맛집 리스트 (맛집 탭) -->
    <div v-show="activeTab === 'food'" class="p-6 h-full flex flex-col">
      <div class="flex-1 flex flex-col items-center justify-center text-center opacity-70">
        <div class="text-6xl mb-4">🍽️</div>
        <h3 class="text-xl font-bold text-gray-800 mb-2">{{ selectedDayIdx + 1 }}일차 맛집 리스트</h3>
        <p class="text-sm text-gray-500">종주 코스 주변의 꿀맛 같은<br>식당 정보를 곧 채워넣을 예정입니다!</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.responsive-panel {
  height: var(--panel-height, 55vh);
  transition: height 0.05s ease-out; /* 부드러운 리사이징 */
}

@media (min-width: 640px) {
  .responsive-panel {
    height: 100% !important;
  }
}
</style>

<style scoped>
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.6); border-radius: 10px; }
::-webkit-scrollbar-thumb:hover { background: rgba(245, 158, 11, 1); }
</style>
