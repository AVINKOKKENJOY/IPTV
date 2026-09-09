let channels = [];
let activeCategoryList = [];
let currentChannelIndex = 0;
let skipTimer = null;
let searchTimeout = null;

let hlsPlayer = null;
let plyrInstance = null;

const isMobileDevice = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// Primary Fallback Stream
const DEFAULT_FALLBACK_CHANNEL = {
  name: "ABC News Live",
  category: "News",
  language: "English",
  url: "https://content.uplynk.com/channel/3324f2467c414329b3b0cc5838d41a37.m3u8"
};

// Standard ISO Language Mapping
const ISO_LANGUAGES = {
  eng: "English", en: "English",
  spa: "Spanish", es: "Spanish",
  fra: "French", fr: "French",
  deu: "German", de: "German",
  ita: "Italian", it: "Italian",
  por: "Portuguese", pt: "Portuguese",
  rus: "Russian", ru: "Russian",
  zho: "Chinese", zh: "Chinese",
  ara: "Arabic", ar: "Arabic",
  hin: "Hindi", hi: "Hindi",
  jpn: "Japanese", ja: "Japanese",
  kor: "Korean", ko: "Korean",
  tur: "Turkish", tr: "Turkish",
  nld: "Dutch", nl: "Dutch",
  pol: "Polish", pl: "Polish"
};

// DOM References
const playlistSelect = document.getElementById('playlistSelect');
const m3uUrlInput = document.getElementById('m3uUrlInput');
const loadBtn = document.getElementById('loadBtn');
const channelListEl = document.getElementById('channelList');
const searchInput = document.getElementById('channelSearch');
const videoPlayer = document.getElementById('videoPlayer');
const statusBar = document.getElementById('statusBar');
const currentChannelName = document.getElementById('currentChannelName');
const prevBtn = document.getElementById('prevBtn');
const stopBtn = document.getElementById('stopBtn');
const nextBtn = document.getElementById('nextBtn');

document.addEventListener('DOMContentLoaded', () => {
  plyrInstance = new Plyr(videoPlayer, {
    controls: ['play-large', 'play', 'mute', 'volume', 'current-time', 'settings', 'pip', 'fullscreen'],
    autoplay: true,
    quality: {
      default: -1,
      options: [-1],
      forced: true,
      onChange: (q) => { if (hlsPlayer) hlsPlayer.currentLevel = q; }
    }
  });

  playlistSelect.value = "https://iptv-org.github.io/iptv/index.m3u";
  fetchAndParsePlaylist(playlistSelect.value);
});

playlistSelect.addEventListener('change', () => {
  m3uUrlInput.value = '';
  fetchAndParsePlaylist(playlistSelect.value);
});

loadBtn.addEventListener('click', () => {
  const customUrl = m3uUrlInput.value.trim();
  fetchAndParsePlaylist(customUrl || playlistSelect.value);
});

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(filterChannels, 150);
});

prevBtn.addEventListener('click', () => navigateCategoryChannel(-1));
nextBtn.addEventListener('click', () => navigateCategoryChannel(1));

// Stop Auto-Skip Handler
stopBtn.addEventListener('click', () => {
  if (skipTimer) {
    clearTimeout(skipTimer);
    skipTimer = null;
  }
  videoPlayer.pause();
  statusBar.textContent = 'Auto-skip stopped';
});

function navigateCategoryChannel(direction) {
  if (activeCategoryList.length === 0) return;
  if (skipTimer) {
    clearTimeout(skipTimer);
    skipTimer = null;
  }

  currentChannelIndex += direction;

  if (currentChannelIndex >= activeCategoryList.length) currentChannelIndex = 0;
  if (currentChannelIndex < 0) currentChannelIndex = activeCategoryList.length - 1;

  const nextChannel = activeCategoryList[currentChannelIndex];
  const targetElement = channelListEl.children[currentChannelIndex];

  playChannel(nextChannel, targetElement, currentChannelIndex, true);
}

// Fetch and Parse Directory
async function fetchAndParsePlaylist(url) {
  statusBar.textContent = 'Loading master channel directory...';
  channelListEl.innerHTML = '<li style="padding: 20px; color: #6b7280; text-align: center; font-size: 0.85rem;">Displaying all channels...</li>';

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok');
    const m3uText = await response.text();
    
    const urlLang = detectLanguageFromUrl(url);
    const parsedChannels = fastM3UParse(m3uText, urlLang);
    const unsortedChannels = [DEFAULT_FALLBACK_CHANNEL, ...parsedChannels];

    // Alphabetical Sorting A to Z
    channels = unsortedChannels.sort((a, b) => 
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
    
    if (channels.length > 0) {
      filterChannels();
      statusBar.textContent = `${channels.length} channels loaded in All Channels`;

      const firstChannel = channels[0];
      const firstElement = channelListEl.children[0];
      playChannel(firstChannel, firstElement, 0, false);
    } else {
      channels = [DEFAULT_FALLBACK_CHANNEL];
      filterChannels();
      playChannel(DEFAULT_FALLBACK_CHANNEL, channelListEl.children[0], 0, false);
    }
  } catch (error) {
    channels = [DEFAULT_FALLBACK_CHANNEL];
    filterChannels();
    playChannel(DEFAULT_FALLBACK_CHANNEL, channelListEl.children[0], 0, false);
    statusBar.textContent = 'Fallback stream active';
  }
}

function detectLanguageFromUrl(url) {
  const match = url.match(/languages\/([a-z]{2,3})\.m3u/i);
  if (match && ISO_LANGUAGES[match[1].toLowerCase()]) {
    return ISO_LANGUAGES[match[1].toLowerCase()];
  }
  return null;
}

// M3U Parsing Engine
function fastM3UParse(m3uData, defaultLanguage = null) {
  const result = [];
  const lines = m3uData.split('\n');
  let name = '', category = 'General', language = defaultLanguage || 'International';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF:')) {
      const groupMatch = line.match(/group-title="([^"]+)"/i);
      category = groupMatch ? groupMatch[1] : 'General';

      const langMatch = line.match(/tvg-language="([^"]+)"/i) || line.match(/language="([^"]+)"/i);
      if (langMatch) {
        const rawLang = langMatch[1].toLowerCase();
        language = ISO_LANGUAGES[rawLang] || capitalize(rawLang);
      } else if (defaultLanguage) {
        language = defaultLanguage;
      } else {
        language = 'International';
      }

      const commaIdx = line.indexOf(',');
      name = commaIdx !== -1 ? line.substring(commaIdx + 1) : 'Unknown Broadcast';
    } else if (line.length > 0 && !line.startsWith('#')) {
      if (name) {
        result.push({
          name: name.trim(),
          category: category.trim(),
          language: language.trim(),
          url: line
        });
        name = '';
      }
    }
  }
  return result;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Search across name, category, and language
function filterChannels() {
  const query = searchInput.value.trim().toLowerCase();
  
  if (!query) {
    activeCategoryList = channels;
  } else {
    activeCategoryList = channels.filter(c => 
      c.name.toLowerCase().includes(query) || 
      c.category.toLowerCase().includes(query) ||
      c.language.toLowerCase().includes(query)
    );
  }

  // Preserve Alphabetical Sorting across filtered results
  activeCategoryList.sort((a, b) => 
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );

  renderChannelList(activeCategoryList);
}

function renderChannelList(list) {
  channelListEl.innerHTML = '';
  if (list.length === 0) {
    channelListEl.innerHTML = '<li style="padding: 20px; color: #6b7280; text-align: center; font-size: 0.85rem;">No channels available</li>';
    return;
  }

  const fragment = document.createDocumentFragment();

  for (let i = 0; i < list.length; i++) {
    const channel = list[i];
    const li = document.createElement('li');
    li.className = 'channel-item';
    li.innerHTML = `
      <span class="channel-name">${channel.name}</span>
      <div class="channel-meta">
        <span class="channel-category">${channel.category}</span>
        <span class="channel-language">${channel.language}</span>
      </div>
    `;

    li.addEventListener('click', () => {
      playChannel(channel, li, i, true);
    });

    fragment.appendChild(li);
  }

  channelListEl.appendChild(fragment);
}

// Immediate Channel Selection & Playback Execution
function playChannel(channel, element, categoryIndex, isUserClicked = true) {
  if (skipTimer) {
    clearTimeout(skipTimer);
    skipTimer = null;
  }
  currentChannelIndex = categoryIndex;

  const prevActive = channelListEl.querySelector('.active');
  if (prevActive) prevActive.classList.remove('active');
  if (element) {
    element.classList.add('active');
    element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  if (isUserClicked && window.innerWidth < 1024) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  currentChannelName.innerHTML = `${channel.name} <span class="header-lang-tag">${channel.language}</span>`;
  statusBar.textContent = 'Connecting...';

  if (hlsPlayer) {
    hlsPlayer.destroy();
    hlsPlayer = null;
  }

  if (isUserClicked) {
    videoPlayer.muted = false;
  }

  if (Hls.isSupported()) {
    hlsPlayer = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      maxBufferLength: isMobileDevice ? 10 : 15,
      maxMaxBufferLength: isMobileDevice ? 20 : 30,
      maxBufferSize: (isMobileDevice ? 15 : 30) * 1024 * 1024,
      backBufferLength: 8,
      manifestLoadingTimeOut: 4000,
      manifestLoadingMaxRetry: 1,
      fragLoadingTimeOut: 5000,
      fragLoadingMaxRetry: 2
    });
    
    hlsPlayer.loadSource(channel.url);
    hlsPlayer.attachMedia(videoPlayer);

    hlsPlayer.on(Hls.Events.MANIFEST_PARSED, function(event, data) {
      const availableQualities = data.levels.map(l => l.height).filter(Boolean);
      availableQualities.unshift(-1);

      plyrInstance.config.quality = {
        default: -1,
        options: availableQualities,
        forced: true,
        onChange: (q) => { if (hlsPlayer) hlsPlayer.currentLevel = q; }
      };

      const playPromise = videoPlayer.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          statusBar.textContent = 'Broadcasting';
        }).catch(() => {
          videoPlayer.muted = true;
          videoPlayer.play();
          statusBar.textContent = 'Broadcasting (Muted)';
        });
      }
    });

    hlsPlayer.on(Hls.Events.ERROR, function(event, data) {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            statusBar.textContent = 'Offline. Auto-skipping...';
            skipTimer = setTimeout(() => navigateCategoryChannel(1), 1200);
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hlsPlayer.recoverMediaError();
            break;
          default:
            statusBar.textContent = 'Playback error. Auto-skipping...';
            skipTimer = setTimeout(() => navigateCategoryChannel(1), 1200);
            break;
        }
      }
    });

  } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
    videoPlayer.src = channel.url;
    videoPlayer.play().then(() => {
      statusBar.textContent = 'Broadcasting';
    }).catch(() => {
      videoPlayer.muted = true;
      videoPlayer.play();
      statusBar.textContent = 'Broadcasting (Muted)';
    });
  }
}
