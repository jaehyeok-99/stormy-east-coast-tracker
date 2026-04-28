<script setup>
import { ref } from 'vue'
import MainMap from './components/MainMap.vue'
import SidePanel from './components/SidePanel.vue'

// 선택된 일정의 구간 데이터 (시작 거리, 끝 거리)
const activeSegment = ref(null)

const handleSelectSegment = (segment) => {
  activeSegment.value = segment
}
</script>

<template>
  <div class="relative w-screen h-screen overflow-hidden bg-gray-50">
    <MainMap :activeSegment="activeSegment" />
    
    <SidePanel @selectSegment="handleSelectSegment" />
    
    <!-- 반응형 타이틀 영역 (모바일에서는 미니멀하게) -->
    <div class="absolute top-3 left-3 sm:top-6 sm:left-6 z-[1000] pointer-events-none">
      <div class="bg-white/90 backdrop-blur-md px-3 py-2 sm:p-5 rounded-lg sm:rounded-2xl shadow-md sm:shadow-xl border border-white/50">
        <h1 class="text-sm sm:text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 tracking-tight">
          폭풍을 부르는 동해안 종주로드 <span class="sm:hidden">🚴</span>
        </h1>
        <p class="hidden sm:block text-xs sm:text-sm font-semibold text-gray-500 mt-1">동해안 자전거 종주 트래커 🚴</p>
      </div>
    </div>
  </div>
</template>
