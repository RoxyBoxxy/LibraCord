<script setup>
import {
  computed,
  nextTick,
  markRaw,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { io } from "socket.io-client";
import { Room, RoomEvent, Track, supportsAV1, supportsVP9 } from "livekit-client";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import {
  faArrowLeft,
  faCamera,
  faComments,
  faDisplay,
  faEye,
  faEyeSlash,
  faGear,
  faHashtag,
  faHeadphones,
  faHouse,
  faMicrophone,
  faMicrophoneSlash,
  faPhoneSlash,
  faRightFromBracket,
  faServer,
  faShieldHalved,
  faPlus,
  faSliders,
  faChartSimple,
  faUsers,
  faVolumeHigh,
  faVolumeXmark,
} from "@fortawesome/free-solid-svg-icons";
const configuredServer = new URLSearchParams(window.location.search).get("server"),
  serverOrigin = configuredServer ? configuredServer.replace(/\/$/, "") : "",
  isDesktopApp = Boolean(window.libracordDesktop),
  socket = io(serverOrigin || undefined, { autoConnect: false, forceNew: true, transports: ["websocket"], reconnection: true, reconnectionAttempts: Infinity }),
  apiEndpoint = (path) => (serverOrigin ? `${serverOrigin}${path}` : path),
  dmPrivateKey = ref(null),
  dmPublicKey = ref(null),
  user = ref(null),
  authMode = ref("login"),
  auth = ref({ email: "", username: "", displayName: "", password: "" }),
  error = ref(""),
  connectionState = ref("connecting"),
  connectionDetail = ref("Connecting to LibraCord…"),
  appBooting = ref(true),
  connectionRetrying = ref(false),
  busy = ref(false),
  page = ref("chat"),
  homeTab = ref("feed"),
  homePosts = ref([]),
  homePostDraft = ref(""),
  publishedItems = ref([]),
  friends = ref([]),
  friendRequests = ref([]),
  friendUsername = ref(""),
  dmTarget = ref(null),
  openDmUsers = ref([]),
  dmMessages = ref([]),
  dmDraft = ref(""),
  dmTypingUsers = ref([]),
  dmUnread = ref(0),
  incomingDmCall = ref(null),
  dmCallRoom = ref(null),
  dmCallMuted = ref(false),
  typingUsers = ref({}),
  typingTimer = ref(null),
  messageRefreshTimer = ref(null),
  collectionIds = ref([]),
  discoverCommunities = ref([]),
  invitePreview = ref(null),
  homeSources = ref([]),
  unavailableHomeSources = ref(0),
  publishForm = ref({ name: "", description: "" }),
  publishImageFile = ref(null),
  communities = ref([]),
  communityRefreshVersion = ref(0),
  communityMenuOpen = ref(false),
  communityStrip = ref(null),
  dockWidth = ref(0),
  dockCanScrollLeft = ref(false),
  dockCanScrollRight = ref(false),
  activeCommunityId = ref(null),
  selected = ref(null),
  messages = ref([]),
  messageSearch = ref(""),
  memberSearch = ref(""),
  channelSearch = ref(""),
  unreadChannels = ref({}),
  unreadCommunities = ref({}),
  draft = ref(""),
  pendingAttachments = ref([]),
  contentWarning = ref(""),
  replyTo = ref(null),
  messageReactions = ref({}),
  reactionMessageId = ref(null),
  composerMenuOpen = ref(false),
  revealedAttachments = ref({}),
  imageLightbox = ref(null),
  soundEnabled = ref(true),
  emojiPickerOpen = ref(false),
  customEmojis = ref([]),
  guildEmojis = ref([]),
  federatedGuildEmojis = ref([]),
  emojiSearch = ref(""),
  collapsedEmojiGroups = ref({}),
  emojiName = ref(""),
  emojiFile = ref(null),
  guildEmojiName = ref(""),
  guildEmojiFile = ref(null),
  instanceEmojiName = ref("LibraCord"),
  voiceRoom = ref(null),
  voiceStatus = ref(""),
  voiceConnecting = ref(false),
  voicePanelOpen = ref(false),
  voiceMessages = ref([]),
  voiceDraft = ref(""),
  voicePendingAttachments = ref([]),
  voiceChatChannelName = ref(""),
  membersPanelOpen = ref(true),
  voiceParticipants = ref([]),
  voiceChannelPresence = ref({}),
  voicePresenceTimer = ref(null),
  voiceScreenShares = ref([]),
  voiceScreenTracks = ref({}),
  watchingScreens = ref([]),
  localScreenTrack = ref(null),
  voiceActiveSpeakers = ref([]),
  voiceMediaVersion = ref(0),
  focusedVoiceParticipant = ref(null),
  voiceStagePosition = ref({ x: null, y: null }),
  voiceStageDrag = ref(null),
  shareDialogOpen = ref(false),
  shareQuality = ref("1080p"),
  shareFps = ref(30),
  shareAudio = ref(true),
  shareSources = ref([]),
  selectedShareSource = ref(""),
  shareSourceTab = ref("applications"),
  networkPanelOpen = ref(false),
  browserSession = ref(null),
  networkStats = ref({ quality: "Unknown", ping: "—", bitrate: "—", codec: "—", jitter: "—", fps: "—" }),
  peers = ref([]),
  peerForm = ref({ name: "", baseUrl: "", status: "pending" }),
  adminTab = ref("instance"),
  instanceForm = ref({}),
  adminUsers = ref([]),
  adminModeration = ref({ bans: [], reports: [], actions: [], system_user: null }),
  guildDialog = ref(false),
  newGuild = ref({ name: "", description: "" }),
  guildSettingsDialog = ref(false),
  communityBackgroundFile = ref(null),
  communityIconFile = ref(null),
  communityBannerFile = ref(null),
  guildForm = ref({
    name: "",
    description: "",
    iconUrl: "",
    bannerUrl: "",
    profile: { bannerColor: "#7857ff", memberTag: "", memberTagEmoji: "", traits: ["", "", "", "", ""] },
  }),
  channelForm = ref({ name: "", kind: "text" }),
  guildSettingsTab = ref("overview"),
  guildRoles = ref([]),
  selectedRole = ref(null),
  roleEditorTab = ref("display"),
  permissionSearch = ref(""),
  guildInvites = ref([]),
  guildWebhooks = ref([]),
  guildCategories = ref([]),
  roleForm = ref({ name: "", color: "#99aab5", permissions: [] }),
  inviteForm = ref({ maxUses: 0 }),
  webhookForm = ref({ name: "", channelId: "" }),
  categoryName = ref(""),
  draggedChannelId = ref(null),
  guildMembers = ref([]),
  channelMenu = ref(null),
  channelSettingsOpen = ref(false),
  channelSettingsTab = ref("overview"),
  channelSettingsForm = ref({}),
  channelPermissionOverrides = ref([]),
  channelPermissionTarget = ref("everyone"),
  supportedVoiceCodecs = ref([{ value: "opus", label: "Opus" }]),
  appMenu = ref(null),
  settingsOpen = ref(false),
  settingsTab = ref("profile"),
  settings = ref({
    theme: "dark",
    compact: false,
    notifications: true,
    soundEffects: true,
    inputDeviceId: "",
    outputDeviceId: "",
    cameraDeviceId: "",
    cameraQuality: "1080p",
    cameraFps: 30,
    inputVolume: 100,
    outputVolume: 100,
    status: "online",
    statusText: "",
    selectedDecorationId: "",
    selectedUsernameStyleIds: [],
    selectedProfileThemeId: "",
    hardwareAcceleration: true,
    accentColor: "#8b5cf6",
    density: "default",
    textSize: 100,
    messageSpacing: "comfortable",
    reducedMotion: false,
    increasedContrast: false,
    reducedTransparency: false,
    showMessagePreviews: true,
    language: "en-GB",
  }),
  profileName = ref(""),
  profileUsername = ref(""),
  profileAvatar = ref(""),
  profileBanner = ref(""),
  profileBio = ref(""),
  profileAccent = ref("#7857ff"),
  profileCss = ref(""),
  uploading = ref(""),
  cropper = ref(null),
  cropZoom = ref(1),
  activeProfile = ref(null),
  activeProfileMode = ref("compact"),
  statusEditorOpen = ref(false),
  statusDraft = ref({ status: "online", text: "" }),
  userMenu = ref(null),
  passwords = ref({ current: "", next: "" }),
  audioDevices = ref({ inputs: [], outputs: [] }),
  videoDevices = ref([]),
  cameraPreview = ref(null),
  cameraTestStream = ref(null),
  micMuted = ref(false),
  deafened = ref(false),
  saved = ref("");
const messageElementRefs = new Map();
function preferredVideoCodec() {
  try {
    if (supportsAV1()) return "av1";
  } catch {}
  try {
    if (supportsVP9()) return "vp9";
  } catch {}
  return "vp8";
}
const activeCommunity = computed(
    () =>
      communities.value.find((item) => item.id === activeCommunityId.value) ||
      communities.value[0],
  ),
  isAdmin = computed(() => ["owner", "admin"].includes(user.value?.role)),
  allCustomEmojis = computed(() => [
    ...federatedGuildEmojis.value,
    ...customEmojis.value,
  ]),
  communityMemberTag = computed(() => ({
    text: String(activeCommunity.value?.profile?.memberTag || "").trim(),
    emoji: String(activeCommunity.value?.profile?.memberTagEmoji || "").trim(),
  })),
  communityAtmosphereStyle = computed(() => {
    const atmosphere = { ...(activeCommunity.value?.profile?.atmosphere || {}) };
    if (!atmosphere.backgroundUrl && activeCommunity.value?.banner_url) {
      atmosphere.mode = "image";
      atmosphere.backgroundUrl = activeCommunity.value.banner_url;
    }
    return atmosphereStyle(atmosphere);
  }),
  compactCommunityDock = computed(() => {
    const estimated = communities.value.reduce(
      (width, guild) => width + 72 + Math.min(guild.name.length * 7, 120),
      112,
    );
    return estimated > dockWidth.value;
  });
const sidebarChannelGroups = computed(() => {
  const query = channelSearch.value.trim().toLowerCase();
  const channels = [...(activeCommunity.value?.channels || [])].filter(
    (channel) => !query || channel.name.toLowerCase().includes(query),
  ).sort(
    (a, b) => (a.position || 0) - (b.position || 0),
  );
  const groups = guildCategories.value
    .map((category) => ({ ...category, channels: channels.filter((channel) => channel.category_id === category.id) }))
    .filter((group) => group.channels.length);
  const uncategorized = channels.filter((channel) => !channel.category_id || !guildCategories.value.some((category) => category.id === channel.category_id));
  return uncategorized.length ? [{ id: "uncategorized", name: "Channels", channels: uncategorized }, ...groups] : groups;
});
const displayedMessages = computed(() => {
  const query = messageSearch.value.trim().toLowerCase();
  return query
    ? messages.value.filter((message) => `${message.author_name} ${message.body}`.toLowerCase().includes(query))
    : messages.value;
});
const displayedGuildMembers = computed(() => {
  const query = memberSearch.value.trim().toLowerCase();
  return query
    ? guildMembers.value.filter((member) => `${member.nickname || ""} ${member.display_name} ${member.username}`.toLowerCase().includes(query))
    : guildMembers.value;
});
let dockObserver;
function updateDockScroll() {
  const strip = communityStrip.value;
  if (!strip) return;
  dockWidth.value = strip.clientWidth;
  dockCanScrollLeft.value = strip.scrollLeft > 2;
  dockCanScrollRight.value =
    strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 2;
}
function setupCommunityDock() {
  dockObserver?.disconnect();
  if (!communityStrip.value) return;
  dockObserver = new ResizeObserver(updateDockScroll);
  dockObserver.observe(communityStrip.value);
  updateDockScroll();
}
function scrollCommunities(direction) {
  communityStrip.value?.scrollBy({
    left: direction * Math.max(180, communityStrip.value.clientWidth * 0.65),
    behavior: "smooth",
  });
  window.setTimeout(updateDockScroll, 350);
}
function atmosphereStyle(atmosphere = {}) {
  const start = atmosphere.start || "#071426";
  const end = atmosphere.end || "#32145f";
  const angle = atmosphere.angle || 135;
  const background =
    atmosphere.mode === "image" && atmosphere.backgroundUrl
      ? `radial-gradient(circle at 72% 4%, #356dff66, transparent 34%), linear-gradient(${angle}deg, ${start}80, ${end}99), url(${atmosphere.backgroundUrl})`
      : atmosphere.mode === "solid"
        ? `radial-gradient(circle at 76% 0%, #6d4aff55, transparent 36%), ${start}`
        : `radial-gradient(circle at 72% 0%, #326dff73, transparent 34%), radial-gradient(circle at 100% 22%, #a32cff42, transparent 30%), linear-gradient(${angle}deg, ${start}, ${end})`;
  return {
    "--community-start": start,
    "--community-end": end,
    "--community-glass": `${atmosphere.glass || 72}%`,
    background,
  };
}
const permissionChoices = [
  ["View channels", 1024],
  ["Send messages", 2048],
  ["Connect to voice", 1048576],
  ["Create invites", 1],
  ["Manage channels", 16],
  ["Manage server", 32],
  ["Manage roles", 268435456],
  ["Manage webhooks", 536870912],
  ["Administrator", 8],
];
const defaultEmojiGroups = [
  {
    name: "Smileys & Emotion",
    icon: "😀",
    emojis: [
      "😀",
      "😃",
      "😄",
      "😁",
      "😆",
      "😅",
      "😂",
      "🤣",
      "😊",
      "😇",
      "🙂",
      "🙃",
      "😉",
      "😍",
      "🥰",
      "😘",
      "😋",
      "😎",
      "🤩",
      "🥳",
      "😭",
      "😡",
      "🤯",
      "🥺",
      "🤔",
      "🫡",
      "🫠",
    ],
  },
  {
    name: "People",
    icon: "👋",
    emojis: [
      "👋",
      "🤚",
      "🖐️",
      "✋",
      "🖖",
      "👌",
      "🤌",
      "✌️",
      "🤞",
      "🫶",
      "🤟",
      "🤘",
      "👍",
      "👎",
      "👏",
      "🙌",
      "👐",
      "🤝",
      "🙏",
      "💅",
      "💪",
    ],
  },
  {
    name: "Animals & Nature",
    icon: "🐻",
    emojis: [
      "🐶",
      "🐱",
      "🐭",
      "🐹",
      "🐰",
      "🦊",
      "🐻",
      "🐼",
      "🐻‍❄️",
      "🐨",
      "🐯",
      "🦁",
      "🐮",
      "🐷",
      "🐸",
      "🐵",
      "🦄",
      "🐝",
      "🦋",
      "🌸",
      "🌈",
      "✨",
    ],
  },
  {
    name: "Food & Drink",
    icon: "🍓",
    emojis: [
      "🍏",
      "🍎",
      "🍐",
      "🍊",
      "🍋",
      "🍉",
      "🍇",
      "🍓",
      "🫐",
      "🍒",
      "🍑",
      "🥭",
      "🍕",
      "🍔",
      "🍟",
      "🍣",
      "🍪",
      "🧁",
      "🍰",
      "☕",
      "🧋",
    ],
  },
  {
    name: "Activities & Objects",
    icon: "🎮",
    emojis: [
      "⚽",
      "🏀",
      "🎮",
      "🎲",
      "🎨",
      "🎭",
      "🎧",
      "🎤",
      "🎸",
      "📷",
      "💻",
      "📱",
      "💡",
      "🎁",
      "🎉",
      "🎊",
      "❤️",
      "💜",
      "💎",
      "🔥",
      "⭐",
      "✅",
    ],
  },
];
async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(serverOrigin ? `${serverOrigin}${path}` : path, {
      credentials: "include",
      ...options,
      headers: { "content-type": "application/json", ...options.headers },
    });
  } catch (cause) {
    connectionState.value = navigator.onLine === false ? "offline" : "reconnecting";
    connectionDetail.value = navigator.onLine === false
      ? "Your internet connection is offline."
      : "The server is not responding. Retrying…";
    throw new Error("Unable to reach the LibraCord server");
  }
  if (response.ok && connectionState.value !== "connected") {
    connectionState.value = "connected";
    connectionDetail.value = "Connected";
  }
  if (response.status === 204) return null;
  const raw = await response.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`API returned an invalid response (${response.status})`);
  }
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
async function retryConnection() {
  if (connectionRetrying.value) return;
  connectionRetrying.value = true;
  connectionState.value = "connecting";
  connectionDetail.value = "Connecting to LibraCord…";
  try {
    const result = await api("/api/auth/me");
    if (result.user && !user.value) await beginSession(result.user);
    connectionState.value = "connected";
    connectionDetail.value = "Connected";
  } catch (cause) {
    connectionState.value = navigator.onLine === false ? "offline" : "reconnecting";
    connectionDetail.value = navigator.onLine === false
      ? "Your internet connection is offline."
      : "The server is still unavailable.";
  } finally {
    connectionRetrying.value = false;
  }
}
async function submitAuth() {
  busy.value = true;
  error.value = "";
  try {
    const path =
        authMode.value === "login" ? "/api/auth/login" : "/api/auth/register",
      body =
        authMode.value === "login"
          ? { email: auth.value.email, password: auth.value.password }
          : auth.value;
    const result = await api(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
    await beginSession(result.user);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
async function beginSession(nextUser) {
  user.value = nextUser;
  settings.value = { ...settings.value, ...nextUser.settings };
  settings.value.selectedUsernameStyleIds = Array.isArray(settings.value.selectedUsernameStyleIds) ? settings.value.selectedUsernameStyleIds : [];
  setProfileForm(nextUser);
  applyAppearance();
  socket.connect();
  try {
    const unread = JSON.parse(localStorage.getItem(`libracord-unread:${serverOrigin || location.origin}:${nextUser.id}`) || "{}");
    unreadChannels.value = unread.channels || {};
    unreadCommunities.value = unread.communities || {};
    dmUnread.value = Math.max(0, Number(unread.dms) || 0);
  } catch {
    unreadChannels.value = {};
    unreadCommunities.value = {};
    dmUnread.value = 0;
  }
  ensureDmKey().catch(() => {});
  communities.value = (await api("/api/v1/guilds")).guilds || [];
  let savedNavigation = null;
  try { savedNavigation = JSON.parse(localStorage.getItem(`libracord-navigation:${serverOrigin || location.origin}:${nextUser.id}`) || "null"); } catch {}
  activeCommunityId.value = communities.value.some((guild) => guild.id === savedNavigation?.communityId)
    ? savedNavigation.communityId : communities.value[0]?.id || null;
  refreshVoicePresence();
  clearInterval(voicePresenceTimer.value);
  voicePresenceTimer.value = setInterval(refreshVoicePresence, 2000);
  const emojiResult = await api(
    `/api/v1/emojis${activeCommunityId.value ? `?guildId=${activeCommunityId.value}` : ""}`,
  );
  customEmojis.value = emojiResult.emojis;
  guildEmojis.value = emojiResult.guild_emojis || [];
  federatedGuildEmojis.value = guildEmojis.value;
  const emojiLists = await Promise.allSettled(
    communities.value.map((guild) => api(`/api/v1/emojis?guildId=${guild.id}`)),
  );
  federatedGuildEmojis.value = [...new Map(
    emojiLists.flatMap((result) => result.status === "fulfilled" ? (result.value.guild_emojis || []) : [])
      .map((emoji) => [emoji.id, emoji]),
  ).values()];
  instanceEmojiName.value = emojiResult.instance;
  publishedItems.value = (await api("/api/v1/home/federated")).items;
  await refreshFriends();
  try {
    const ids = JSON.parse(localStorage.getItem(`libracord-open-dms:${serverOrigin || location.origin}:${nextUser.id}`) || "[]");
    const conversations = (await api("/api/v1/dms")).conversations || [];
    const availableContacts = [...new Map([...conversations, ...friends.value].map((contact) => [contact.id, contact])).values()];
    const savedContacts = availableContacts.filter((friend) => ids.includes(friend.id));
    // Older sessions did not persist the open conversation list; keep the
    // friends available so existing DMs remain discoverable after refresh.
    openDmUsers.value = savedContacts.length ? savedContacts : availableContacts;
  } catch { openDmUsers.value = []; }
  collectionIds.value = (
    await api("/api/v1/users/@me/collection")
  ).collection.map((item) => item.item_id);
  const inviteCode = location.pathname.match(/^\/invite\/([^/]+)$/)?.[1];
  if (inviteCode)
    invitePreview.value = (
      await api(`/api/v1/invites/${encodeURIComponent(inviteCode)}`)
    ).invite;
  if (activeCommunityId.value)
    guildMembers.value = (
      await api(`/api/v1/guilds/${activeCommunityId.value}/members`)
    ).members;
  if (activeCommunityId.value) guildRoles.value = (await api(`/api/v1/guilds/${activeCommunityId.value}/roles`)).roles;
  if (activeCommunityId.value) guildCategories.value = (await api(`/api/v1/guilds/${activeCommunityId.value}/categories`)).categories;
  if (savedNavigation?.page === "home") {
    await openHome(savedNavigation.homeTab || "feed");
    if (savedNavigation.homeTab === "dm" && savedNavigation.dmUserId) {
      const target = openDmUsers.value.find((item) => item.id === savedNavigation.dmUserId) || friends.value.find((item) => item.id === savedNavigation.dmUserId);
      if (target) await openDm(target);
    }
  } else {
    const activeGuild = communities.value.find((guild) => guild.id === activeCommunityId.value);
    const restored = activeGuild?.channels?.find((channel) => channel.id === savedNavigation?.channelId);
    const first = restored || activeGuild?.channels?.find((c) => c.kind === "text");
    if (first) await selectChannel(first);
  }
}
async function refreshFriends() { const result = await api("/api/v1/friends"); friends.value = result.friends || []; friendRequests.value = result.requests || []; }
const dmKeyStorage = () => `libracord-dm-key:${serverOrigin || location.origin}`;
function bytesToBase64(bytes) { let binary = ""; bytes.forEach((b) => { binary += String.fromCharCode(b); }); return btoa(binary); }
function base64ToBytes(value) { return Uint8Array.from(atob(value), (c) => c.charCodeAt(0)); }
async function ensureDmKey() {
  if (dmPrivateKey.value && dmPublicKey.value) return;
  let stored = null; try { stored = JSON.parse(localStorage.getItem(dmKeyStorage()) || "null"); } catch {}
  if (stored?.private && stored?.public) {
    dmPrivateKey.value = await crypto.subtle.importKey("jwk", stored.private, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
    dmPublicKey.value = stored.public;
  } else {
    const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
    dmPrivateKey.value = pair.privateKey;
    dmPublicKey.value = await crypto.subtle.exportKey("jwk", pair.publicKey);
    localStorage.setItem(dmKeyStorage(), JSON.stringify({ private: await crypto.subtle.exportKey("jwk", pair.privateKey), public: dmPublicKey.value }));
  }
  await api("/api/v1/crypto/key", { method: "PUT", body: JSON.stringify({ publicKey: JSON.stringify(dmPublicKey.value) }) });
}
async function dmSharedKey(otherId) {
  await ensureDmKey();
  const result = await api(`/api/v1/crypto/key/${encodeURIComponent(otherId)}`);
  if (!result.publicKey) throw new Error("This user has not enabled encrypted messages yet");
  const publicKey = await crypto.subtle.importKey("jwk", JSON.parse(result.publicKey), { name: "ECDH", namedCurve: "P-256" }, false, []);
  return crypto.subtle.deriveKey({ name: "ECDH", public: publicKey }, dmPrivateKey.value, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function encryptDm(body, otherId) { const key = await dmSharedKey(otherId), iv = crypto.getRandomValues(new Uint8Array(12)), data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(body)); return `e2ee:v1:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(data))}`; }
async function decryptDm(value, otherId) { if (!String(value).startsWith("e2ee:v1:")) return value; try { const [, , iv, payload] = String(value).split(":"); const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, await dmSharedKey(otherId), base64ToBytes(payload)); return new TextDecoder().decode(data); } catch { return "[Unable to decrypt message]"; } }
async function openDm(target) {
  if (!target?.id) return;
  dmTarget.value = target;
  if (!openDmUsers.value.some((item) => item.id === target.id)) openDmUsers.value.push(target);
  localStorage.setItem(`libracord-open-dms:${serverOrigin || location.origin}:${user.value.id}`, JSON.stringify(openDmUsers.value.map((item) => item.id)));
  page.value = "home";
  homeTab.value = "dm";
  dmMessages.value = (await api(`/api/v1/dms/${encodeURIComponent(target.id)}`)).messages || [];
  await ensureDmKey();
  dmMessages.value = await Promise.all(dmMessages.value.map(async (message) => ({ ...message, body: await decryptDm(message.body, message.sender_id === user.value.id ? target.id : message.sender_id) })));
}
async function sendDm() {
  if (!dmTarget.value || !dmDraft.value.trim()) return;
  const plaintext = dmDraft.value.trim();
  const encrypted = await encryptDm(plaintext, dmTarget.value.id);
  socket.emit("dm:send", { recipientId: dmTarget.value.id, body: encrypted }, (result) => { if (!result?.ok) error.value = result?.error || "Unable to send direct message"; });
  dmDraft.value = "";
}
function startDmCall(mode) {
  if (!dmTarget.value) return;
  const callId = crypto.randomUUID();
  socket.emit("dm:call-invite", { recipientId: dmTarget.value.id, mode, callId });
}
async function joinDmCall(otherId) {
  const credentials = await api("/api/livekit/token", { method: "POST", body: JSON.stringify({ dmUserId: otherId }) });
  const room = new Room({
    adaptiveStream: false,
    dynacast: false,
    publishDefaults: { videoCodec: preferredVideoCodec() },
  });
  room.on(RoomEvent.TrackSubscribed, (track) => { if (track.kind === Track.Kind.Audio) { const audio = document.createElement("audio"); audio.autoplay = true; audio.srcObject = new MediaStream([track.mediaStreamTrack]); document.body.appendChild(audio); } else if (track.kind === Track.Kind.Video) { const video = document.createElement("video"); video.autoplay = true; video.playsInline = true; video.srcObject = new MediaStream([track.mediaStreamTrack]); let media = document.querySelector(".dm-call-media"); if (!media) { media = document.createElement("div"); media.className = "dm-call-media"; document.querySelector(".dm-call-card")?.prepend(media); } media.appendChild(video); } });
  await room.connect(credentials.url, credentials.token);
  await room.localParticipant.setMicrophoneEnabled(true);
  await room.localParticipant.setCameraEnabled(true);
  const localVideo = [...room.localParticipant.videoTrackPublications.values()].find((publication) => publication.track)?.track;
  if (localVideo) { const video = document.createElement("video"); video.autoplay = true; video.muted = true; video.playsInline = true; video.srcObject = new MediaStream([localVideo.mediaStreamTrack]); let media = document.querySelector(".dm-call-media"); if (!media) { media = document.createElement("div"); media.className = "dm-call-media"; document.querySelector(".dm-call-card")?.prepend(media); } media.appendChild(video); }
  dmCallRoom.value = markRaw(room);
}
async function leaveDmCall() { if (dmCallRoom.value) await dmCallRoom.value.disconnect(); dmCallRoom.value = null; }
async function toggleDmMute() { if (!dmCallRoom.value) return; dmCallMuted.value = !dmCallMuted.value; await dmCallRoom.value.localParticipant.setMicrophoneEnabled(!dmCallMuted.value); }
function announceDmTyping() { if (dmTarget.value) socket.emit("dm:typing", { recipientId: dmTarget.value.id, typing: true }); }
function announceTyping() {
  const channelId = selected.value?.kind === "text" ? selected.value.id : null;
  if (!channelId) return;
  socket.emit("typing:start", channelId);
  clearTimeout(typingTimer.value);
  typingTimer.value = setTimeout(() => socket.emit("typing:stop", channelId), 1800);
}
async function addFriend() { if (!friendUsername.value.trim()) return; try { await api("/api/v1/friends/request", { method: "POST", body: JSON.stringify({ username: friendUsername.value.trim() }) }); friendUsername.value = ""; await refreshFriends(); } catch (e) { error.value = e.message; } }
async function acceptFriend(request) { await api(`/api/v1/friends/${request.id}/accept`, { method: "POST" }); await refreshFriends(); }
async function removeFriendEntry(friend) { await api(`/api/v1/friends/${friend.id}`, { method: "DELETE" }); friends.value = friends.value.filter((item) => item.id !== friend.id); }
async function refreshVoicePresence() {
  if (!activeCommunityId.value) return;
  try { voiceChannelPresence.value = (await api(`/api/v1/voice/presence?communityId=${encodeURIComponent(activeCommunityId.value)}`)).channels || {}; } catch { /* LiveKit may be offline */ }
}
function emitCommunityChanged(communityId = activeCommunityId.value) {
  if (communityId) socket.emit("community:changed", { communityId: String(communityId) });
}
async function refreshCommunityFromServer(communityId) {
  if (!communityId) return;
  const id = String(communityId);
  const refreshVersion = ++communityRefreshVersion.value;
  try {
    const result = (await api("/api/v1/guilds")).guilds || [];
    if (refreshVersion !== communityRefreshVersion.value) return;
    const fresh = (result || []).find((guild) => String(guild.id) === id);
    if (!fresh) return;
    const index = communities.value.findIndex((guild) => String(guild.id) === id);
    if (index >= 0) communities.value[index] = fresh;
    if (String(activeCommunityId.value) !== id) return;
    const [members, roles, categories] = await Promise.all([
      api(`/api/v1/guilds/${encodeURIComponent(id)}/members`),
      api(`/api/v1/guilds/${encodeURIComponent(id)}/roles`),
      api(`/api/v1/guilds/${encodeURIComponent(id)}/categories`),
    ]);
    guildMembers.value = members.members || [];
    guildRoles.value = roles.roles || [];
    guildCategories.value = categories.categories || [];
    await refreshVoicePresence();
    if (selected.value && !fresh.channels?.some((channel) => channel.id === selected.value.id)) {
      const first = fresh.channels?.find((channel) => channel.kind === "text");
      if (first) await selectChannel(first);
    }
  } catch {
    // Ignore transient refresh failures; the next event or navigation will retry.
  }
}
async function logout() {
  clearInterval(messageRefreshTimer.value);
  clearInterval(voicePresenceTimer.value);
  voicePresenceTimer.value = null;
  await leaveVoice();
  socket.disconnect();
  await api("/api/auth/logout", { method: "POST" });
  if (user.value) localStorage.removeItem(`libracord-navigation:${serverOrigin || location.origin}:${user.value.id}`);
  if (isDesktopApp) {
    window.libracordDesktop?.logout?.();
    return;
  }
  user.value = null;
  communities.value = [];
  messages.value = [];
  page.value = "chat";
}
async function selectChannel(channel) {
  page.value = "chat";
  if (selected.value) socket.emit("channel:leave", selected.value.id);
  // Voice is independent from the currently browsed community/channel. Keep
  // the LiveKit room alive when navigating to text or another community;
  // explicitly selecting a different voice channel is the one exception.
  if (
    channel.kind === "voice" &&
    voiceRoom.value &&
    voiceRoom.value.__channelId !== channel.id
  ) {
    await leaveVoice();
  }
  selected.value = channel;
  clearInterval(messageRefreshTimer.value);
  if (channel.kind === "text") {
    const next = { ...unreadChannels.value }; delete next[channel.id]; unreadChannels.value = next;
    const communityUnread = { ...unreadCommunities.value }; delete communityUnread[channel.community_id]; unreadCommunities.value = communityUnread;
  }
  if (channel.kind === "voice") {
    if (voiceRoom.value?.__channelId === channel.id) {
      updateVoiceStatus();
      return;
    }
    return joinVoice(channel);
  }
  socket.emit("channel:join", channel.id);
  messages.value = (await api(`/api/v1/channels/${channel.id}/messages`)).messages || [];
  messageRefreshTimer.value = setInterval(async () => {
    if (selected.value?.id !== channel.id || selected.value?.kind !== "text") return;
    try {
      const latest = await api(`/api/v1/channels/${channel.id}/messages`);
      if (selected.value?.id === channel.id) messages.value = latest.messages || [];
    } catch {}
  }, 2000);
}
async function sendMessage() {
  const body = draft.value.trim();
  if ((!body && !pendingAttachments.value.length) || !selected.value || selected.value.kind !== "text") return;
  if (!socket.connected) {
    try {
      await api(`/api/v1/channels/${selected.value.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: body, attachments: pendingAttachments.value, contentWarning: contentWarning.value, replyTo: replyTo.value?.id }),
      });
      draft.value = "";
      pendingAttachments.value = [];
      contentWarning.value = "";
      replyTo.value = null;
      const refreshed = await api(
        `/api/v1/channels/${selected.value.id}/messages`,
      );
      messages.value = refreshed.messages || [];
    } catch (e) {
      error.value = e.message;
    }
    return;
  }
  socket.emit("message:create", { channelId: selected.value.id, body, attachments: pendingAttachments.value, contentWarning: contentWarning.value, replyTo: replyTo.value?.id }, (result) => {
    if (result?.ok) { draft.value = ""; pendingAttachments.value = []; contentWarning.value = ""; replyTo.value = null; }
    else error.value = result?.error || "Message could not be sent";
  });
}
async function uploadMessageAttachment(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file || !selected.value) return;
  try {
    const form = new FormData(); form.append("file", file);
    const result = await fetch(apiEndpoint(`/api/v1/channels/${selected.value.id}/attachments`), { method: "POST", credentials: "include", body: form });
    const payload = await result.json();
    if (!result.ok) throw new Error(payload.error || "Upload failed");
    pendingAttachments.value.push(payload.attachment);
  } catch (e) { error.value = e.message; }
}
function reactToMessage(message, emoji = "❤️") {
  const current = messageReactions.value[message.id] || [];
  messageReactions.value = { ...messageReactions.value, [message.id]: current.includes(emoji) ? current.filter((item) => item !== emoji) : [...current, emoji] };
}
function reactionCustomEmoji(reaction) {
  const match = String(reaction || "").match(/^:([^:]+):$/);
  return match ? allCustomEmojis.value.find((emoji) => emoji.name === match[1]) || null : null;
}
function openImageLightbox(source, name = "Image") {
  imageLightbox.value = { source: apiEndpoint(source), name: name || "Image" };
}
function closeImageLightbox() {
  imageLightbox.value = null;
}
function handleLightboxKey(event) {
  if (event.key === "Escape" && imageLightbox.value) closeImageLightbox();
}
function toggleAttachment(messageId, attachmentId) {
  const key = `${messageId}:${attachmentId}`;
  revealedAttachments.value = { ...revealedAttachments.value, [key]: !revealedAttachments.value[key] };
}
function playUiSound(kind) {
  if (!soundEnabled.value || settings.value.soundEffects === false) return;
  const audio = new Audio(`/sounds/${kind}.ogg`);
  audio.volume = 0.28;
  const result = audio.play();
  if (result && typeof result.catch === "function") result.catch(() => {});
}
async function showDesktopNotification(title, body, onOpen) {
  if (!settings.value.notifications || typeof Notification === "undefined") return;
  if (Notification.permission === "default") return;
  if (Notification.permission !== "granted") return;
  const notification = new Notification(title, { body, icon: "/favicon.svg" });
  notification.onclick = () => {
    window.focus();
    onOpen?.();
    notification.close();
  };
}
function toggleEmojiGroup(name) {
  collapsedEmojiGroups.value[name] = !collapsedEmojiGroups.value[name];
}
function chooseEmoji(value) {
  if (reactionMessageId.value) {
    const target = messages.value.find((message) => Number(message.id) === Number(reactionMessageId.value));
    if (target) reactToMessage(target, value);
    reactionMessageId.value = null;
    emojiPickerOpen.value = false;
    emojiSearch.value = "";
    return;
  }
  draft.value += value;
  emojiPickerOpen.value = false;
}
function openReactionPicker(message) {
  reactionMessageId.value = message.id;
  emojiSearch.value = "";
  emojiPickerOpen.value = true;
}
function closeEmojiPicker() {
  emojiPickerOpen.value = false;
  reactionMessageId.value = null;
  emojiSearch.value = "";
}
function toggleComposerEmojiPicker() {
  const opening = !emojiPickerOpen.value || Boolean(reactionMessageId.value);
  reactionMessageId.value = null;
  emojiSearch.value = "";
  emojiPickerOpen.value = opening;
}
function filteredDefaultEmojis(group) {
  return emojiSearch.value
    ? group.emojis.filter((emoji) => emoji.includes(emojiSearch.value))
    : group.emojis;
}
function filteredCustomEmojis(list = customEmojis.value) {
  const search = emojiSearch.value.trim().toLowerCase();
  return search ? list.filter((emoji) => emoji.name.includes(search)) : list;
}
function formatDiscordTimestamp(unix, style = "f") {
  const date = new Date(Number(unix) * 1000);
  if (!Number.isFinite(date.getTime())) return null;
  if (style === "R") {
    const seconds = Math.round((date.getTime() - Date.now()) / 1000);
    const abs = Math.abs(seconds);
    const unit = abs < 60 ? "second" : abs < 3600 ? "minute" : abs < 86400 ? "hour" : abs < 2592000 ? "day" : abs < 31536000 ? "month" : "year";
    const amount = Math.max(1, Math.round(abs / ({ second: 1, minute: 60, hour: 3600, day: 86400, month: 2592000, year: 31536000 }[unit] || 1)));
    return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(seconds < 0 ? -amount : amount, unit);
  }
  const options = {
    d: { dateStyle: "short" }, D: { dateStyle: "long" },
    f: { dateStyle: "short", timeStyle: "short" }, F: { dateStyle: "full", timeStyle: "short" },
    g: { dateStyle: "short", timeStyle: "short" }, G: { dateStyle: "long", timeStyle: "short" },
    t: { timeStyle: "short" }, T: { timeStyle: "medium" },
  }[style] || { dateStyle: "short", timeStyle: "short" };
  return new Intl.DateTimeFormat(undefined, options).format(date);
}
function messageSegments(body) {
  const byName = new Map(
    allCustomEmojis.value.map((emoji) => [emoji.name, emoji]),
  );
  return String(body || "").split(/(<t:-?\d{1,14}(?::[tTdDfFgGR])?>|:[a-z0-9_]{2,32}:)/g).filter(Boolean).map((value) => {
    const timestamp = value.match(/^<t:(-?\d{1,14})(?::([tTdDfFgGR]))?>$/);
    if (timestamp) {
      const formatted = formatDiscordTimestamp(timestamp[1], timestamp[2] || "f");
      return formatted ? { type: "timestamp", value: formatted, title: new Date(Number(timestamp[1]) * 1000).toLocaleString() } : { type: "text", value };
    }
    const emoji = value.match(/^:([a-z0-9_]{2,32}):$/)?.[1];
    return emoji && byName.get(emoji) ? { type: "emoji", ...byName.get(emoji) } : { type: "text", value };
  });
}
function messageAuthor(message) {
  if (message.author_id === user.value?.id) return user.value;
  return guildMembers.value.find((member) => member.id === message.author_id) || null;
}
function repliedMessage(message) {
  if (!message?.reply_to) return null;
  return messages.value.find((candidate) => Number(candidate.id) === Number(message.reply_to)) || null;
}
function setMessageElement(messageId, element) {
  if (element) messageElementRefs.set(Number(messageId), element);
  else messageElementRefs.delete(Number(messageId));
}
async function jumpToMessage(messageId) {
  const id = Number(messageId);
  if (!messageElementRefs.has(id) && messageSearch.value) {
    messageSearch.value = "";
    await nextTick();
  }
  const element = messageElementRefs.get(id);
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.classList.remove("message-jump-highlight");
  void element.offsetWidth;
  element.classList.add("message-jump-highlight");
  window.setTimeout(() => element.classList.remove("message-jump-highlight"), 1800);
}
async function uploadEmoji() {
  if (!emojiFile.value || !emojiName.value.trim()) return;
  try {
    const form = new FormData();
    form.append("name", emojiName.value);
    form.append("image", emojiFile.value);
    const response = await fetch(apiEndpoint("/api/v1/admin/emojis"), {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Emoji upload failed");
    customEmojis.value.push(result.emoji);
    emojiName.value = "";
    emojiFile.value = null;
    error.value = "";
    saved.value = "Emoji uploaded";
  } catch (uploadError) {
    error.value = uploadError.message;
  }
}
async function removeEmoji(emoji) {
  await api(`/api/v1/admin/emojis/${emoji.id}`, { method: "DELETE" });
  customEmojis.value = customEmojis.value.filter(
    (item) => item.id !== emoji.id,
  );
}
async function uploadGuildEmoji() {
  if (!guildEmojiFile.value || !guildEmojiName.value.trim()) return;
  try {
    const form = new FormData();
    form.append("name", guildEmojiName.value);
    form.append("image", guildEmojiFile.value);
    const response = await fetch(
      apiEndpoint(`/api/v1/guilds/${activeCommunity.value.id}/emojis`),
      { method: "POST", credentials: "include", body: form },
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Emoji upload failed");
    guildEmojis.value.push(result.emoji);
    guildEmojiName.value = "";
    guildEmojiFile.value = null;
    saved.value = "Community emoji uploaded";
  } catch (uploadError) {
    error.value = uploadError.message;
  }
}
async function removeGuildEmoji(emoji) {
  await api(`/api/v1/guilds/${activeCommunity.value.id}/emojis/${emoji.id}`, {
    method: "DELETE",
  });
  guildEmojis.value = guildEmojis.value.filter((item) => item.id !== emoji.id);
}
async function joinVoice(channel) {
  await leaveVoice();
  voiceConnecting.value = true;
  voiceStatus.value = `Connecting to ${channel.name}…`;
  let room = null;
  try {
    const credentials = await api("/api/livekit/token", {
        method: "POST",
        body: JSON.stringify({ channelId: channel.id }),
      });
    // Keep the full-quality video layer available. Adaptive stream can lock
    // onto a low layer when the tile starts small and never recover after it
    // is expanded fullscreen.
    room = new Room({
      adaptiveStream: false,
      dynacast: false,
      publishDefaults: { videoCodec: preferredVideoCodec() },
    });
    room.on(RoomEvent.TrackSubscribed, async (track, publication, participant) => {
      if (track.kind === Track.Kind.Audio) {
        // Never play a locally published track back to the sharer. This is
        // especially important for captured app/system audio, which would
        // otherwise be heard as a delayed duplicate.
        if (participant?.sid === room.localParticipant.sid || participant?.identity === user.value?.id) return;
        const element = document.createElement("audio");
        element.srcObject = new MediaStream([track.mediaStreamTrack]);
        element.autoplay = true;
        element.playsInline = true;
        element.volume = settings.value.outputVolume / 100;
        element.muted = deafened.value;
        if (settings.value.outputDeviceId && element.setSinkId)
          element.setSinkId(settings.value.outputDeviceId).catch(() => {});
        document.querySelector("#remote-audio")?.appendChild(element);
        if (typeof element.play === "function") element.play().catch(() => {});
      } else if (track.kind === Track.Kind.Video) {
        const participantSid = participant?.sid || track.participant?.sid;
        const sourceName = String(publication?.source || "").toLowerCase();
        const isScreen = publication?.source === Track.Source.ScreenShare || sourceName.includes("screen");
        if (isScreen && participantSid && !voiceScreenShares.value.includes(participantSid)) {
          voiceScreenShares.value = [...voiceScreenShares.value, participantSid];
        }
        if (isScreen && participantSid) {
          voiceScreenTracks.value = { ...voiceScreenTracks.value, [participantSid]: markRaw(track) };
          return;
        }
        await nextTick();
        const target = document.querySelector(`#${isScreen ? `voice-screen-${participantSid}` : `voice-tile-${participantSid}`}`);
        if (target) {
          if (isScreen) target.classList.add("screen-tile");
          attachVoicePreview(
            target,
            track.mediaStreamTrack,
            `voice-video-tile ${isScreen ? "screen-share-video" : "camera-video"}`,
          );
        }
      }
    });
    room.on(RoomEvent.ParticipantConnected, () => { syncVoiceParticipants(); updateVoiceStatus(); socket.emit("voice:changed", channel.id); });
    room.on(RoomEvent.ParticipantDisconnected, () => { syncVoiceParticipants(); updateVoiceStatus(); socket.emit("voice:changed", channel.id); });
    room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      if (track.kind !== Track.Kind.Video) return;
      const sid = participant?.sid || track.participant?.sid;
      const isScreen = publication?.source === Track.Source.ScreenShare || String(publication?.source || "").toLowerCase().includes("screen");
      if (isScreen && sid) voiceScreenShares.value = voiceScreenShares.value.filter((item) => item !== sid);
      if (isScreen && sid) {
        const tracks = { ...voiceScreenTracks.value };
        delete tracks[sid];
        voiceScreenTracks.value = tracks;
        watchingScreens.value = watchingScreens.value.filter((item) => item !== sid);
      }
      const id = isScreen ? `voice-screen-${sid}` : `voice-tile-${sid}`;
      document.querySelector(`#${id} video`)?.remove();
    });
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      voiceActiveSpeakers.value = speakers.map((speaker) => speaker.sid);
    });
    await room.connect(credentials.url, credentials.token);
    room.__channelId = channel.id;
    room.__communityId = channel.community_id;
    // LiveKit Room contains native WebRTC objects and must not be wrapped in
    // Vue's Proxy, which Electron cannot structured-clone.
    voiceRoom.value = markRaw(room);
    voiceChatChannelName.value = channel.name;
    socket.emit("voice-chat:join", channel.id);
    voiceConnecting.value = false;
    socket.emit("voice:changed", channel.id);
    playUiSound("join");
    syncVoiceParticipants();
    await room.localParticipant.setMicrophoneEnabled(
      !micMuted.value,
      settings.value.inputDeviceId
        ? { deviceId: settings.value.inputDeviceId }
        : undefined,
    );
    updateVoiceStatus();
    // Side-chat availability must never decide whether the LiveKit call stays
    // connected (for example while the API server is restarting or an older
    // server version is still running).
    try {
      voiceMessages.value = (await api(`/api/v1/voice/channels/${channel.id}/messages`)).messages || [];
    } catch {
      voiceMessages.value = [];
    }
  } catch (e) {
    // Do not leave LiveKit's reconnect loop running after a failed join. It
    // would reuse a stale session and repeatedly create duplicate identities.
    if (room) await room.disconnect().catch(() => {});
    voiceConnecting.value = false;
    voiceStatus.value = e.message?.includes("signal") || e.message?.includes("fetch")
      ? "Could not reach LiveKit signaling. Check the public /rtc WebSocket route and try again."
      : e.message;
  }
}
function updateVoiceStatus() {
  if (voiceRoom.value)
    voiceStatus.value = `In voice · ${voiceRoom.value.remoteParticipants.size + 1} connected`;
}
async function leaveVoice() {
  const changedChannelId = voiceRoom.value?.__channelId;
  if (changedChannelId) socket.emit("voice-chat:leave", changedChannelId);
  if (voiceRoom.value) playUiSound("leave");
  if (voiceRoom.value) await voiceRoom.value.disconnect();
  if (changedChannelId) socket.emit("voice:changed", changedChannelId);
  if (changedChannelId && voiceChannelPresence.value[changedChannelId]) {
    voiceChannelPresence.value = {
      ...voiceChannelPresence.value,
      [changedChannelId]: voiceChannelPresence.value[changedChannelId].filter((entry) => entry.identity !== user.value?.id),
    };
  }
  voiceRoom.value = null;
  voiceConnecting.value = false;
  voiceStatus.value = "";
  voicePanelOpen.value = false;
  voiceMessages.value = [];
  voiceDraft.value = "";
  voicePendingAttachments.value = [];
  voiceChatChannelName.value = "";
  voiceParticipants.value = [];
  voiceScreenShares.value = [];
  voiceScreenTracks.value = {};
  watchingScreens.value = [];
  voiceActiveSpeakers.value = [];
  focusedVoiceParticipant.value = null;
  document.querySelector("#voice-stage")?.replaceChildren();
  document.querySelector("#remote-audio")?.replaceChildren();
  await refreshVoicePresence();
}
async function sendVoiceMessage() {
  const channelId = voiceRoom.value?.__channelId;
  const body = voiceDraft.value.trim();
  if (!channelId || (!body && !voicePendingAttachments.value.length)) return;
  if (!socket.connected) {
    try {
      const result = await api(`/api/v1/voice/channels/${channelId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: body, attachments: voicePendingAttachments.value }),
      });
      if (!voiceMessages.value.some((item) => item.id === result.message.id)) voiceMessages.value.push(result.message);
      voiceDraft.value = "";
      voicePendingAttachments.value = [];
    } catch (e) { error.value = e.message; }
    return;
  }
  socket.emit("voice:message:create", { channelId, body, attachments: voicePendingAttachments.value }, (result) => {
    if (result?.ok) { voiceDraft.value = ""; voicePendingAttachments.value = []; }
    else error.value = result?.error || "Voice message could not be sent";
  });
}
async function uploadVoiceAttachment(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  const channelId = voiceRoom.value?.__channelId;
  if (!file || !channelId) return;
  try {
    const form = new FormData(); form.append("file", file);
    const response = await fetch(apiEndpoint(`/api/v1/voice/channels/${channelId}/attachments`), { method: "POST", credentials: "include", body: form });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Upload failed");
    voicePendingAttachments.value.push(payload.attachment);
  } catch (e) { error.value = e.message; }
}
function voiceColor(identity) {
  let hash = 0;
  for (const char of String(identity || "")) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360} 68% 55%)`;
}
function channelPresence(channel) {
  void voiceMediaVersion.value;
  return (voiceChannelPresence.value[channel.id] || []).map((entry) => {
    const member = guildMembers.value.find((item) => item.id === entry.identity || item.username === entry.identity);
    const live = channel.id === voiceRoom.value?.__channelId
      ? voiceParticipants.value.find((item) => item.userId === entry.identity || item.identity === entry.name)
      : null;
    const local = live?.local ? voiceRoom.value?.localParticipant : null;
    const remote = live && !live.local ? voiceRoom.value?.remoteParticipants.get(live.sid) : null;
    const camera = local?.isCameraEnabled || Boolean(remote?.getTrackPublication?.(Track.Source.Camera)?.track) || entry.camera;
    return {
      ...entry,
      name: member?.display_name || entry.name || entry.identity,
      avatar: member?.avatar_url || live?.avatar || "",
      banner: member?.banner_url || live?.banner || "",
      color: member?.accent_color || live?.color || voiceColor(entry.identity),
      sid: live?.sid || "",
      speaking: Boolean(live && voiceActiveSpeakers.value.includes(live.sid)),
      camera: Boolean(camera),
      screen: Boolean((live && voiceScreenShares.value.includes(live.sid)) || entry.screen),
    };
  });
}
function primaryMemberRole(member) {
  return (member?.roles || []).filter((role) => !role.managed).sort((a, b) => Number(b.position || 0) - Number(a.position || 0))[0] || null;
}
function usernameThemeStyle(member) {
  const hasMemberStyles = Boolean(member && Object.prototype.hasOwnProperty.call(member, "username_style_ids"));
  let selectedIds = member?.username_style_ids;
  if (typeof selectedIds === "string") { try { selectedIds = JSON.parse(selectedIds); } catch { selectedIds = []; } }
  // A member payload is authoritative, including an explicit empty list. Only
  // fall back to local settings for the current user object before membership
  // data has been loaded.
  selectedIds = hasMemberStyles
    ? (Array.isArray(selectedIds) ? selectedIds : [])
    : (Array.isArray(settings.value.selectedUsernameStyleIds) ? settings.value.selectedUsernameStyleIds : []);
  const styles = selectedIds.map((id) => publishedItem(id)).filter((item) => item?.payload?.usernameEffect);
  const decoration = styles[0] || profileDecoration(member);
  const role = primaryMemberRole(member);
  if (decoration?.payload?.usernameEffect) {
    const colors = styles.length ? styles.flatMap((item) => [item.payload.accentColor, item.payload.secondaryColor]) : [decoration.payload.accentColor, decoration.payload.secondaryColor];
    return {
      backgroundImage: `linear-gradient(90deg, ${colors.join(", ")}, ${colors[0]})`,
      backgroundSize: "200% 100%",
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
      WebkitTextFillColor: "transparent",
      textShadow: "none",
      fontFamily: styles.some((item) => item.payload.usernameEffect === "glitch") ? "ui-monospace, SFMono-Regular, monospace" : "inherit",
      animation: decoration.payload.usernameEffect === "glitch" ? "username-glitch 1.8s steps(2,end) infinite" : "username-shimmer 3s linear infinite",
    };
  }
  // Keep a selected style independent from role coloring even while the
  // federated catalog is still loading the style definition.
  if (selectedIds.length) return { color: "#dffaff", WebkitTextFillColor: "#dffaff", textShadow: "none" };
  return role ? { color: role.color } : {};
}
function membersWithRole(roleId) {
  return guildMembers.value.filter((member) => member.roles?.some((role) => role.id === roleId));
}
function isFirstRoleMember(member, index, list = guildMembers.value) {
  const role = primaryMemberRole(member)?.id || "__online";
  return list.findIndex((item) => (primaryMemberRole(item)?.id || "__online") === role) === index;
}
async function toggleMemberRole(role) {
  const targetId = userMenu.value?.id;
  if (!targetId || !activeCommunity.value) return;
  const member = guildMembers.value.find((item) => item.id === targetId);
  const ids = new Set((member?.roles || []).map((item) => item.id));
  ids.has(role.id) ? ids.delete(role.id) : ids.add(role.id);
  try {
    const result = await api(`/api/v1/guilds/${activeCommunity.value.id}/members/${targetId}/roles`, { method: "PUT", body: JSON.stringify({ roleIds: [...ids] }) });
    if (member) member.roles = (guildRoles.value || []).filter((item) => result.role_ids.includes(item.id));
    emitCommunityChanged(activeCommunity.value.id);
    userMenu.value = null;
  } catch (e) { error.value = e.message; }
}
const filteredShareSources = computed(() => {
  if (shareSourceTab.value === "devices") return [];
  if (shareSourceTab.value === "screens") return shareSources.value.filter((source) => source.kind === "screen" || source.id?.startsWith("screen:"));
  return shareSources.value.filter((source) => source.kind !== "screen" && !source.id?.startsWith("screen:"));
});
const voiceFloatingStyle = computed(() =>
  voiceStagePosition.value.x == null
    ? {}
    : {
        left: `${voiceStagePosition.value.x}px`,
        top: `${voiceStagePosition.value.y}px`,
        right: "auto",
        bottom: "auto",
      },
);
const userSettingsPages = {
  profile: ["My profile", "Manage your identity, profile media, biography, and cosmetics."],
  password: ["Password", "Update the password used to access your account."],
  audio: ["Voice & audio", "Configure microphones, speakers, cameras, and call quality."],
  appearance: ["Appearance", "Choose how LibraCord looks and feels on this device."],
  accessibility: ["Accessibility", "Adjust motion, contrast, text, and reading preferences."],
  notifications: ["Notifications", "Control alerts, sounds, and desktop notifications."],
  privacy: ["Privacy & safety", "Manage messaging, content, and safety preferences."],
  language: ["Language", "Choose your display language and regional preferences."],
  desktop: ["Desktop app", "Configure native desktop behavior and performance."],
  advanced: ["Advanced", "Manage diagnostic and advanced client options."],
};
const communitySettingsPages = {
  overview: ["Server profile", "Configure your community identity, description, icon, and banner."],
  appearance: ["Atmosphere", "Customize the visual character of this community."],
  channels: ["Channels", "Create, organize, and manage community channels and categories."],
  roles: ["Roles", "Control member roles and their community permissions."],
  members: ["Members", "Review and manage the people in this community."],
  invites: ["Invites", "Create and manage links that bring people into the community."],
  webhooks: ["Webhooks", "Connect external services and automated messages."],
  emoji: ["Emoji", "Manage custom expression for this community."],
  safety: ["Safety setup", "Configure moderation and community safety defaults."],
  audit: ["Audit log", "Review important administrative actions."],
  onboarding: ["Onboarding", "Shape the experience for new community members."],
};
const userSettingsPage = computed(() => userSettingsPages[settingsTab.value] || userSettingsPages.profile);
const communitySettingsPage = computed(() => communitySettingsPages[guildSettingsTab.value] || ["Community settings", "Configure and manage this community."]);
const visibleVoiceParticipants = computed(() => {
  if (!voiceRoom.value || selected.value?.id === voiceRoom.value.__channelId)
    return voiceParticipants.value;
  const active = voiceParticipants.value.filter((participant) =>
    voiceActiveSpeakers.value.includes(participant.sid),
  );
  const sharing = voiceParticipants.value.filter((participant) => voiceScreenShares.value.includes(participant.sid));
  const prioritized = [...sharing, ...active].filter((participant, index, list) => list.findIndex((item) => item.sid === participant.sid) === index);
  return prioritized.length ? prioritized : voiceParticipants.value.slice(0, 1);
});
const visibleVoiceVisuals = computed(() => {
  const visuals = [];
  for (const participant of visibleVoiceParticipants.value) {
    visuals.push(participant);
    if (voiceScreenShares.value.includes(participant.sid)) {
      visuals.push({ ...participant, sid: `${participant.sid}-screen`, participantSid: participant.sid, isScreen: true });
    }
  }
  if (focusedVoiceParticipant.value) {
    const focused = visuals.find((participant) => participant.sid === focusedVoiceParticipant.value);
    return focused
      ? [focused, ...visuals.filter((participant) => participant.sid !== focusedVoiceParticipant.value)]
      : visuals;
  }
  return visuals;
});
function startVoiceStageDrag(event) {
  if (!voiceRoom.value || selected.value?.id === voiceRoom.value.__channelId) return;
  if (event.target.closest("button, video, img")) return;
  const rect = event.currentTarget.getBoundingClientRect();
  voiceStageDrag.value = {
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
  event.currentTarget.addEventListener("pointermove", moveVoiceStage);
  event.currentTarget.addEventListener("pointerup", stopVoiceStageDrag, { once: true });
}
function moveVoiceStage(event) {
  if (!voiceStageDrag.value) return;
  const width = document.documentElement.clientWidth;
  const height = document.documentElement.clientHeight;
  const stage = event.currentTarget;
  const rect = stage.getBoundingClientRect();
  voiceStagePosition.value = {
    x: Math.max(8, Math.min(width - rect.width - 8, event.clientX - voiceStageDrag.value.offsetX)),
    y: Math.max(8, Math.min(height - rect.height - 8, event.clientY - voiceStageDrag.value.offsetY)),
  };
}
function stopVoiceStageDrag(event) {
  voiceStageDrag.value = null;
  event.currentTarget.removeEventListener("pointermove", moveVoiceStage);
}
function voiceTileId(participant) {
  return participant.isScreen ? `voice-screen-${participant.participantSid}` : `voice-tile-${participant.sid}`;
}
function attachVoicePreview(target, mediaStreamTrack, className, muted = false) {
  if (!target || !mediaStreamTrack) return;
  const trackId = mediaStreamTrack.id || `${mediaStreamTrack.kind}-track`;
  const current = target.querySelector("video");
  if (current?.dataset.trackId === trackId) return;
  target.querySelectorAll("video").forEach((video) => video.remove());
  target.querySelectorAll("img").forEach((image) => image.remove());
  target.querySelector(".voice-placeholder")?.remove();
  const element = document.createElement("video");
  element.srcObject = new MediaStream([mediaStreamTrack]);
  element.autoplay = true;
  element.playsInline = true;
  element.muted = muted;
  element.className = className;
  element.dataset.trackId = trackId;
  target.appendChild(element);
  element.play?.().catch(() => {});
}
async function watchScreen(participant) {
  const sid = participant.participantSid || participant.sid;
  if (!sid) return;
  if (!watchingScreens.value.includes(sid)) watchingScreens.value = [...watchingScreens.value, sid];
  await nextTick();
  const track = voiceScreenTracks.value[sid];
  const target = document.querySelector(`#voice-screen-${sid}`);
  if (!track || !target) return;
  attachVoicePreview(target, track.mediaStreamTrack, "voice-video-tile screen-share-video", participant.local);
}
async function restoreVoicePreviews(visuals = visibleVoiceVisuals.value) {
  await nextTick();
  for (const participant of visuals.filter((item) => item.isScreen && watchingScreens.value.includes(item.participantSid))) {
    const tile = document.querySelector(`#voice-screen-${participant.participantSid}`);
    if (tile && !tile.querySelector("video")) await watchScreen(participant);
  }
  const local = voiceRoom.value?.localParticipant;
  if (!local) return;
  const cameraPublication = local.getTrackPublication?.(Track.Source.Camera) ||
    [...local.videoTrackPublications.values()].find((publication) => publication.track && String(publication.source).toLowerCase().includes("camera"));
  const cameraTile = document.querySelector(`#voice-tile-${local.sid}`);
  if (cameraPublication?.track && cameraTile)
    attachVoicePreview(cameraTile, cameraPublication.track.mediaStreamTrack, "voice-video-tile local local-camera", true);
  for (const participant of voiceRoom.value.remoteParticipants.values()) {
    const publication = participant.getTrackPublication?.(Track.Source.Camera) ||
      [...participant.videoTrackPublications.values()].find((item) => item.track && String(item.source).toLowerCase().includes("camera"));
    const tile = document.querySelector(`#voice-tile-${participant.sid}`);
    if (publication?.track && tile)
      attachVoicePreview(tile, publication.track.mediaStreamTrack, "voice-video-tile camera-video");
  }
}
watch([visibleVoiceVisuals, page, () => selected.value?.id], async ([visuals]) => {
  await restoreVoicePreviews(visuals);
});
function syncVoiceParticipants() {
  if (!voiceRoom.value) return;
  const local = voiceRoom.value.localParticipant;
  voiceParticipants.value = [
    { sid: local.sid, userId: user.value.id, identity: user.value.display_name, local: true, avatar: user.value.avatar_url, banner: user.value.banner_url, color: user.value.accent_color },
    ...[...voiceRoom.value.remoteParticipants.values()].map((participant) => {
      const member = guildMembers.value.find(
        (entry) => entry.id === participant.identity || entry.username === participant.identity,
      );
      return {
        sid: participant.sid,
        userId: participant.identity,
        identity: member?.display_name || participant.identity,
        local: false,
        avatar: member?.avatar_url || "",
        banner: member?.banner_url || "",
        color: member?.accent_color || voiceColor(participant.identity),
      };
    }),
  ];
}
function focusVoiceParticipant(participant) {
  const focusId = participant.sid;
  focusedVoiceParticipant.value = focusedVoiceParticipant.value === focusId ? null : focusId;
  nextTick(() => restoreVoicePreviews());
}
async function toggleCamera() {
  if (!voiceRoom.value) return;
  const enabling = !voiceRoom.value.localParticipant.isCameraEnabled;
  try {
    const cameraDeviceId = String(settings.value.cameraDeviceId || "");
    const cameraSizes = { "720p": { width: 1280, height: 720 }, "1080p": { width: 1920, height: 1080 }, "1440p": { width: 2560, height: 1440 }, "4K": { width: 3840, height: 2160 } };
    const cameraSize = cameraSizes[settings.value.cameraQuality] || cameraSizes["1080p"];
    const cameraFps = Number(settings.value.cameraFps || 30);
    const cameraBitrate = settings.value.cameraQuality === "4K" ? 40_000_000 : settings.value.cameraQuality === "1440p" ? 20_000_000 : settings.value.cameraQuality === "1080p" ? 10_000_000 : 5_000_000;
    // Do not impose an artificial 720p/30 cap: let the selected webcam and
    // browser negotiate their native resolution and frame rate.
    const publication = await voiceRoom.value.localParticipant.setCameraEnabled(
      enabling,
      {
        ...(cameraDeviceId ? { deviceId: cameraDeviceId } : {}),
        resolution: { ...cameraSize, frameRate: cameraFps },
        frameRate: { ideal: cameraFps, max: cameraFps },
      },
      { videoCodec: preferredVideoCodec(), videoEncoding: { maxBitrate: cameraBitrate, maxFramerate: cameraFps }, degradationPreference: "maintain-resolution", simulcast: true },
    );
    await nextTick();
    const localTile = document.querySelector(`#voice-tile-${voiceRoom.value.localParticipant.sid}`);
    localTile?.querySelectorAll("video")?.forEach((video) => video.remove());
    if (!enabling) return;
    const track = publication?.track;
    if (track && localTile)
      attachVoicePreview(localTile, track.mediaStreamTrack, "voice-video-tile local local-camera", true);
    voiceMediaVersion.value += 1;
  } catch (error) {
    voiceStatus.value = error?.message || "Could not access your camera. Check browser permissions.";
  }
}
async function testCamera() {
  try {
    cameraTestStream.value?.getTracks().forEach((track) => track.stop());
    const cameraDeviceId = String(settings.value.cameraDeviceId || "");
    const cameraSizes = { "720p": { width: 1280, height: 720 }, "1080p": { width: 1920, height: 1080 }, "1440p": { width: 2560, height: 1440 }, "4K": { width: 3840, height: 2160 } };
    const cameraSize = cameraSizes[settings.value.cameraQuality] || cameraSizes["1080p"];
    const cameraFps = Number(settings.value.cameraFps || 30);
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { ...(cameraDeviceId ? { deviceId: { exact: cameraDeviceId } } : {}), width: { ideal: cameraSize.width }, height: { ideal: cameraSize.height }, frameRate: { ideal: cameraFps, max: cameraFps } },
    });
    cameraTestStream.value = stream;
    await nextTick();
    if (cameraPreview.value) {
      cameraPreview.value.srcObject = stream;
      cameraPreview.value.muted = true;
      cameraPreview.value.play?.().catch(() => {});
    }
  } catch (e) {
    error.value = e.message || "Could not access your webcam";
  }
}
function stopCameraTest() {
  cameraTestStream.value?.getTracks().forEach((track) => track.stop());
  cameraTestStream.value = null;
  if (cameraPreview.value) cameraPreview.value.srcObject = null;
}
async function toggleScreenShare() {
  if (!voiceRoom.value) return;
  if (!voiceRoom.value.localParticipant.isScreenShareEnabled) {
    if (isDesktopApp && window.libracordDesktop?.getDisplaySources) {
      try {
        shareSources.value = await window.libracordDesktop.getDisplaySources();
        selectedShareSource.value ||= shareSources.value[0]?.id || "";
      } catch (e) {
        voiceStatus.value = e?.message || "Could not list display sources";
      }
    }
    shareDialogOpen.value = true;
    return;
  }
  try {
    const local = voiceRoom.value.localParticipant;
    const publications = [...local.trackPublications.values()].filter((publication) =>
      String(publication.source || "").toLowerCase().includes("screen"),
    );
    for (const publication of publications) {
      if (publication.track) await local.unpublishTrack(publication.track, true);
    }
    localScreenTrack.value?.stop?.();
    localScreenTrack.value = null;
    const sid = local.sid;
    voiceScreenShares.value = voiceScreenShares.value.filter((item) => item !== sid);
    delete voiceScreenTracks.value[sid];
    watchingScreens.value = watchingScreens.value.filter((item) => item !== sid);
    document.querySelector(`#voice-screen-${sid}`)?.remove();
    voiceMediaVersion.value += 1;
  } catch (error) {
    voiceStatus.value = error?.message || "Could not stop screen sharing";
  }
}
async function startScreenShare() {
  shareDialogOpen.value = false;
  try {
    if (isDesktopApp && selectedShareSource.value && window.libracordDesktop?.setDisplaySource)
      await window.libracordDesktop.setDisplaySource(selectedShareSource.value);
    const resolutions = { "720p": { width: 1280, height: 720 }, "1080p": { width: 1920, height: 1080 }, "1440p": { width: 2560, height: 1440 }, "4K": { width: 3840, height: 2160 } };
    const size = resolutions[shareQuality.value];
    let stream;
    if (isDesktopApp && selectedShareSource.value) {
      // Electron can bind capture to the exact screen/window returned by
      // desktopCapturer. This avoids the desktop client's own window being
      // mixed into an app share.
      const sourceId = selectedShareSource.value;
      stream = await navigator.mediaDevices.getUserMedia({
        video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: sourceId, maxWidth: size.width, maxHeight: size.height, maxFrameRate: Number(shareFps.value) } },
        audio: shareAudio.value ? { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: sourceId } } : false,
      });
    } else {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { ...size, frameRate: Number(shareFps.value) },
        audio: Boolean(shareAudio.value),
      });
    }
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      // Motion mode prevents Chromium from treating a screen as a mostly
      // static document and throttling its capture cadence.
      videoTrack.contentHint = "motion";
      try { await videoTrack.applyConstraints({ frameRate: { ideal: Number(shareFps.value), max: Number(shareFps.value) } }); } catch {}
    }
    localScreenTrack.value = videoTrack;
    const maxBitrate = shareQuality.value === "4K" ? 50_000_000 : shareQuality.value === "1440p" ? 24_000_000 : shareQuality.value === "1080p" ? 12_000_000 : 6_000_000;
    await voiceRoom.value.localParticipant.publishTrack(videoTrack, {
      source: Track.Source.ScreenShare,
      name: "screen",
      videoCodec: preferredVideoCodec(),
      simulcast: true,
      videoEncoding: { maxBitrate, maxFramerate: Number(shareFps.value) },
      degradationPreference: "maintain-resolution",
    });
    const localSid = voiceRoom.value.localParticipant.sid;
    if (!voiceScreenShares.value.includes(localSid)) voiceScreenShares.value = [...voiceScreenShares.value, localSid];
    voiceScreenTracks.value = {
      ...voiceScreenTracks.value,
      [localSid]: markRaw({ mediaStreamTrack: videoTrack }),
    };
    if (!watchingScreens.value.includes(localSid)) watchingScreens.value = [...watchingScreens.value, localSid];
    voiceMediaVersion.value += 1;
    await nextTick();
    const localTile = document.querySelector(`#voice-screen-${localSid}`);
    if (localTile) {
      localTile.querySelector(".voice-placeholder")?.remove();
      localTile.querySelectorAll("img").forEach((image) => image.remove());
      localTile.classList.add("screen-tile");
      attachVoicePreview(localTile, videoTrack, "voice-video-tile local-screen screen-share-video", true);
    }
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) await voiceRoom.value.localParticipant.publishTrack(audioTrack, { source: Track.Source.ScreenShareAudio, name: "screen-audio" });
    videoTrack.addEventListener("ended", async () => {
      if (voiceRoom.value) {
        await voiceRoom.value.localParticipant.unpublishTrack(videoTrack, true);
        const sid = voiceRoom.value.localParticipant.sid;
        localScreenTrack.value = null;
        voiceScreenShares.value = voiceScreenShares.value.filter((item) => item !== sid);
        document.querySelector(`#voice-screen-${sid} video.local-screen`)?.remove();
      }
    });
  } catch (e) {
    voiceStatus.value = e.message || "Screen sharing was cancelled";
  }
}
async function startSharedBrowser() {
  if (!voiceRoom.value || !selected.value) return;
  try {
    browserSession.value = await api("/api/v1/voice/browser", {
      method: "POST",
      body: JSON.stringify({ channelId: selected.value.id, url: "https://www.wikipedia.org" }),
    });
  } catch (e) { voiceStatus.value = e.message; }
}
function closeSharedBrowser() { browserSession.value = null; }
let networkTimer;
const networkBaseline = new Map();
async function refreshNetworkStats() {
  if (!voiceRoom.value) return;
  const room = voiceRoom.value;
  const tracks = [];
  for (const publication of room.localParticipant.trackPublications.values()) {
    const report = await publication.track?.getRTCStatsReport?.();
    if (report) tracks.push(report);
  }
  for (const participant of room.remoteParticipants.values()) {
    for (const publication of participant.trackPublications.values()) {
      const report = await publication.track?.getRTCStatsReport?.();
      if (report) tracks.push(report);
    }
  }
  let bytes = 0, jitter = 0, jitterCount = 0, fps = 0, codec = "—", rtt = 0;
  const now = performance.now();
  for (const report of tracks) report.forEach((stat) => {
    if (stat.type === "inbound-rtp" || stat.type === "outbound-rtp") {
      const key = stat.ssrc || stat.id;
      const previous = networkBaseline.get(key);
      if (previous) bytes += Math.max(0, (stat.bytesReceived ?? stat.bytesSent ?? 0) - previous.bytes) * 8 / Math.max(0.25, (now - previous.time) / 1000);
      networkBaseline.set(key, { bytes: stat.bytesReceived ?? stat.bytesSent ?? 0, time: now });
      if (stat.jitter != null) { jitter += stat.jitter; jitterCount++; }
      if (stat.framesPerSecond) fps = Math.max(fps, stat.framesPerSecond);
      if (stat.codecId) { const c = report.get(stat.codecId); if (c?.mimeType) codec = c.mimeType.replace(/^audio\//, "").replace(/^video\//, ""); }
    }
    if (stat.type === "candidate-pair" && stat.state === "succeeded" && stat.currentRoundTripTime) rtt = Math.max(rtt, stat.currentRoundTripTime * 1000);
  });
  const quality = String(room.localParticipant.connectionQuality || "unknown");
  networkStats.value = { quality, ping: rtt ? `${Math.round(rtt)} ms` : "—", bitrate: bytes ? `${(bytes / 1000).toFixed(0)} kbps` : "—", codec, jitter: jitterCount ? `${Math.round((jitter / jitterCount) * 1000)} ms` : "—", fps: fps ? String(Math.round(fps)) : "—" };
}
watch(networkPanelOpen, (open) => {
  clearInterval(networkTimer);
  if (open) { refreshNetworkStats(); networkTimer = setInterval(refreshNetworkStats, 1000); }
});
async function openFederation() {
  adminTab.value = "federation";
  page.value = "federation";
  error.value = "";
  try {
    peers.value = await api("/api/admin/federation");
  } catch (e) {
    error.value = e.message;
  }
}
async function openAdmin(tab = "instance") {
  page.value = "admin";
  adminTab.value = tab;
  error.value = "";
  if (tab === "instance") instanceForm.value = await api("/api/v1/instance");
  if (tab === "users")
    adminUsers.value = (await api("/api/v1/admin/users")).users.map((member) => ({ ...member, moderationReason: "", systemMessage: "" }));
  if (tab === "federation") peers.value = await api("/api/admin/federation");
  if (tab === "moderation") adminModeration.value = await api("/api/v1/admin/moderation");
}
async function saveInstance() {
  try {
    instanceForm.value = await api("/api/v1/admin/instance", {
      method: "PATCH",
      body: JSON.stringify(instanceForm.value),
    });
    saved.value = "Instance settings saved";
  } catch (e) {
    error.value = e.message;
  }
}
async function saveAdminUser(member) {
  try {
    const result = await api(`/api/v1/admin/users/${member.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        role: member.role,
        suspended: Boolean(member.suspended),
      }),
    });
    Object.assign(member, result.user);
  } catch (e) {
    error.value = e.message;
  }
}
async function banAdminUser(member) {
  const reason = String(member.moderationReason || "").trim();
  if (!reason) { error.value = "Enter a reason before banning this account."; return; }
  if (!confirm(`Ban ${member.display_name} from this instance?`)) return;
  try {
    await api(`/api/v1/admin/moderation/users/${encodeURIComponent(member.id)}/ban`, { method: "POST", body: JSON.stringify({ reason }) });
    member.suspended = true;
    member.moderationReason = "";
    saved.value = `${member.display_name} was banned and signed out.`;
  } catch (e) { error.value = e.message; }
}
async function sendAdminSystemMessage(member) {
  const body = String(member.systemMessage || "").trim();
  if (!body) { error.value = "Enter a system message first."; return; }
  try {
    await api(`/api/v1/admin/moderation/users/${encodeURIComponent(member.id)}/message`, {
      method: "POST", body: JSON.stringify({ subject: "Message from instance moderation", body }),
    });
    member.systemMessage = "";
    saved.value = `System message sent to ${member.display_name}.`;
  } catch (e) { error.value = e.message; }
}
async function updateModerationReport(report, status) {
  const resolution = status === "dismissed" || status === "actioned" ? prompt("Resolution note") : "";
  if ((status === "dismissed" || status === "actioned") && resolution === null) return;
  try {
    const result = await api(`/api/v1/admin/moderation/reports/${report.id}`, {
      method: "PATCH", body: JSON.stringify({ status, resolution: resolution || report.resolution || "" }),
    });
    Object.assign(report, result.report);
  } catch (e) {
    error.value = e.message;
    adminModeration.value = await api("/api/v1/admin/moderation");
  }
}
async function unbanAdminUser(ban) {
  try {
    await api(`/api/v1/admin/moderation/users/${encodeURIComponent(ban.user_id)}/ban`, { method: "DELETE" });
    adminModeration.value.bans = adminModeration.value.bans.filter((item) => item.user_id !== ban.user_id);
  } catch (e) { error.value = e.message; }
}
async function reportUserFromMenu() {
  const target = userMenu.value;
  if (!target?.id || target.id === user.value.id) return;
  const description = prompt(`Tell the instance moderators why you are reporting ${target.name || "this user"}:`);
  if (description === null || !description.trim()) return;
  try {
    await api("/api/v1/reports", { method: "POST", body: JSON.stringify({ targetType: "user", targetId: target.id,
      category: "user-report", description: description.trim(), evidence: { community_id: activeCommunityId.value, channel_id: selected.value?.id || null } }) });
    saved.value = "Report sent to the instance moderation team.";
  } catch (e) { error.value = e.message; }
  userMenu.value = null;
}
async function createGuild() {
  try {
    const result = await api("/api/v1/guilds", {
      method: "POST",
      body: JSON.stringify(newGuild.value),
    });
    communities.value.push(result.guild);
    activeCommunityId.value = result.guild.id;
    guildMembers.value = (
      await api(`/api/v1/guilds/${result.guild.id}/members`)
    ).members;
    guildDialog.value = false;
    newGuild.value = { name: "", description: "" };
    await selectChannel(result.guild.channels[0]);
  } catch (e) {
    error.value = e.message;
  }
}
async function chooseGuild(guild) {
  communityMenuOpen.value = false;
  page.value = "chat";
  activeCommunityId.value = guild.id;
  guildMembers.value = (
    await api(`/api/v1/guilds/${guild.id}/members`)
  ).members;
  guildRoles.value = (await api(`/api/v1/guilds/${guild.id}/roles`)).roles;
  guildCategories.value = (await api(`/api/v1/guilds/${guild.id}/categories`)).categories;
  guildEmojis.value = (
    await api(`/api/v1/emojis?guildId=${guild.id}`)
  ).guild_emojis;
  federatedGuildEmojis.value = [
    ...new Map([...federatedGuildEmojis.value, ...guildEmojis.value].map((emoji) => [emoji.id, emoji])).values(),
  ];
  const first = guild.channels.find((channel) => channel.kind === "text");
  if (first) await selectChannel(first);
}
async function openHome(tab = "feed") {
  // Home is a clean top-level surface; dismiss overlays from the previous community.
  channelMenu.value = null;
  appMenu.value = null;
  userMenu.value = null;
  emojiPickerOpen.value = false;
  channelSettingsOpen.value = false;
  guildSettingsDialog.value = false;
  settingsOpen.value = false;
  statusEditorOpen.value = false;
  shareDialogOpen.value = false;
  networkPanelOpen.value = false;
  page.value = "home";
  homeTab.value = tab;
  if (tab === "dm") {
    dmUnread.value = 0;
    await refreshFriends();
    if (!openDmUsers.value.length) openDmUsers.value = friends.value;
  }
  const result = await api("/api/v1/home/federated");
  homePosts.value = result.posts;
  publishedItems.value = result.items;
  homeSources.value = result.sources;
  unavailableHomeSources.value = result.unavailable;
  if (tab === "discover")
    discoverCommunities.value = (
      await api("/api/v1/discovery/communities")
    ).communities;
}
async function publishStatus() {
  if (!homePostDraft.value.trim()) return;
  const result = await api("/api/v1/home/posts", {
    method: "POST",
    body: JSON.stringify({ body: homePostDraft.value }),
  });
  homePosts.value.unshift(result.post);
  homePostDraft.value = "";
  await openHome("feed");
}
function publishedKindForTab() {
  return {
    themes: "theme",
    decorations: "decoration",
    profiles: "profile-theme",
    usernames: "decoration",
  }[homeTab.value];
}
function publishedItemsForTab() {
  const kind = publishedKindForTab();
  return publishedItems.value.filter((item) => item.kind === kind && (homeTab.value !== "usernames" || item.payload?.usernameEffect));
}
function publishedPreviewStyle(item) {
  if (item.kind === "theme") return atmosphereStyle(item.payload);
  return {
    "--decoration-primary": item.payload.accentColor || "#62efc6",
    "--decoration-secondary": item.payload.secondaryColor || "#172033",
    background: `linear-gradient(135deg, ${item.payload.accentColor || "#62efc6"}, ${item.payload.secondaryColor || "#172033"})`,
  };
}
function publishedItem(id) {
  return publishedItems.value.find((item) => item.id === id);
}
function inviteUrl(invite) {
  return `${window.location.origin}/invite/${invite.code}`;
}
async function copyInvite(invite) {
  await navigator.clipboard.writeText(inviteUrl(invite));
}
function closeInvitePreview() {
  invitePreview.value = null;
  history.replaceState({}, "", "/");
}
function isCollected(item) {
  return collectionIds.value.includes(item.id);
}
async function addToCollection(item) {
  await api(
    `/api/v1/users/@me/collection/${encodeURIComponent(item.id)}`,
    { method: "PUT" },
  );
  if (!isCollected(item)) collectionIds.value.push(item.id);
}
async function removeFromCollection(item) {
  await api(
    `/api/v1/users/@me/collection/${encodeURIComponent(item.id)}`,
    { method: "DELETE" },
  );
  collectionIds.value = collectionIds.value.filter((id) => id !== item.id);
  if (settings.value.selectedDecorationId === item.id)
    settings.value.selectedDecorationId = "";
  if (settings.value.selectedProfileThemeId === item.id)
    settings.value.selectedProfileThemeId = "";
  settings.value.selectedUsernameStyleIds = settings.value.selectedUsernameStyleIds.filter((id) => id !== item.id);
  await saveSettings();
}
async function joinFromInvite() {
  const result = await api(`/api/v1/invites/${invitePreview.value.code}/join`, {
    method: "POST",
  });
  communities.value = (await api("/api/v1/guilds")).guilds || [];
  const joined = communities.value.find(
    (guild) => guild.id === result.invite.guild_id,
  );
  invitePreview.value = null;
  history.replaceState({}, "", "/");
  if (joined) await chooseGuild(joined);
}
async function joinRemoteCommunity(guild) {
  error.value = "";
  try {
    await api("/api/v1/federation/memberships", {
      method: "POST",
      body: JSON.stringify({ address: guild.address }),
    });
    guild.membership_status = "pending";
  } catch (e) {
    error.value = e.message;
  }
}
async function removeCommunityMember(member) {
  if (!confirm(`Remove ${member.display_name} from this community?`)) return;
  await api(`/api/v1/guilds/${activeCommunityId.value}/members/${member.id}`, {
    method: "DELETE",
  });
  guildMembers.value = guildMembers.value.filter((entry) => entry.id !== member.id);
}
function profileThemeStyle(profile) {
  const theme = publishedItem(
    profile?.profile_theme_id || settings.value.selectedProfileThemeId,
  );
  if (!theme) return {};
  const accent = theme.payload.accentColor || "#62efc6";
  const background = theme.payload.backgroundColor || "#081623";
  const text = theme.payload.textColor || "#ffffff";
  return {
    "--profile-accent": accent,
    "--profile-theme-bg": background,
    "--profile-theme-text": text,
    backgroundImage: theme.payload.imageUrl
      ? `linear-gradient(#07111a66,#07111aaa),url(${theme.payload.imageUrl})`
      : `linear-gradient(145deg,${background},color-mix(in srgb,${accent} 28%,${background}))`,
  };
}
function profileDecoration(profile) {
  return publishedItem(
    profile?.decoration_id || settings.value.selectedDecorationId,
  );
}
function profileBannerStyle(profile) {
  if (profile?.banner_url) return { backgroundImage: `url(${profile.banner_url})` };
  const accent = profile?.accent_color || "#ff8fcf";
  return { background: `linear-gradient(135deg, ${accent}, #6f2a82 72%, #21152c)` };
}
async function publishCreation() {
  const kind = publishedKindForTab();
  if (!kind || !publishForm.value.name.trim()) return;
  let imageUrl = "";
  if (publishImageFile.value) {
    const upload = new FormData();
    upload.append("image", publishImageFile.value);
    const response = await fetch(apiEndpoint("/api/v1/home/published/assets"), {
      method: "POST",
      credentials: "include",
      body: upload,
    });
    const uploadResult = await response.json();
    if (!response.ok)
      throw new Error(uploadResult.error || "Decoration upload failed");
    imageUrl = uploadResult.asset.url;
  }
  const payload =
    kind === "theme"
      ? activeCommunity.value?.profile?.atmosphere || {}
      : kind === "profile-theme"
        ? { accentColor: profileAccent.value, css: profileCss.value, imageUrl }
        : {
            accentColor: profileAccent.value,
            secondaryColor: "#f15bb5",
            label: "profile-decoration",
            ...(homeTab.value === "usernames" ? { usernameEffect: "shimmer", frame: "username" } : {}),
            imageUrl,
          };
  const result = await api("/api/v1/home/published", {
    method: "POST",
    body: JSON.stringify({ kind, ...publishForm.value, payload }),
  });
  publishedItems.value.unshift(result.item);
  publishForm.value = { name: "", description: "" };
  publishImageFile.value = null;
  await openHome(homeTab.value);
}
function showChannelMenu(event, channel) {
  event.preventDefault();
  appMenu.value = null;
  channelMenu.value = {
    channel,
    x: Math.max(8, Math.min(event.clientX, window.innerWidth - 230)),
    y: Math.max(8, Math.min(event.clientY, window.innerHeight - 480)),
  };
}
function showAppMenu(event) {
  event.preventDefault();
  channelMenu.value = null;
  const target = event.target;
  const editable =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target?.isContentEditable;
  appMenu.value = {
    x: Math.max(8, Math.min(event.clientX, window.innerWidth - 220)),
    y: Math.max(
      8,
      Math.min(event.clientY, window.innerHeight - (editable ? 190 : 145)),
    ),
    target,
    editable,
    hasSelection: Boolean(window.getSelection()?.toString()),
  };
}
async function runAppMenuAction(action) {
  const menu = appMenu.value;
  if (!menu) return;
  try {
    if (action === "copy") {
      const text = menu.editable
        ? menu.target.value.slice(
            menu.target.selectionStart,
            menu.target.selectionEnd,
          )
        : window.getSelection()?.toString();
      if (text) await navigator.clipboard.writeText(text);
    } else if (action === "paste" && menu.editable) {
      const text = await navigator.clipboard.readText();
      menu.target.setRangeText(
        text,
        menu.target.selectionStart,
        menu.target.selectionEnd,
        "end",
      );
      menu.target.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (action === "select") {
      if (menu.editable) menu.target.select();
      else
        window
          .getSelection()
          ?.selectAllChildren(
            document.querySelector(".shell") || document.body,
          );
    } else if (action === "settings") {
      openSettings();
    }
  } catch {
    error.value = "Your browser blocked clipboard access.";
  }
  appMenu.value = null;
}
async function renameChannel() {
  const name = prompt("Channel name", channelMenu.value.channel.name);
  if (!name) return;
  const result = await api(`/api/v1/channels/${channelMenu.value.channel.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...channelMenu.value.channel,
      name,
      categoryId: channelMenu.value.channel.category_id,
      slowmodeSeconds: channelMenu.value.channel.slowmode_seconds,
      contentVisibility: channelMenu.value.channel.content_visibility,
    }),
  });
  Object.assign(channelMenu.value.channel, result.channel);
  emitCommunityChanged(activeCommunity.value?.id);
  channelMenu.value = null;
}
async function openChannelSettings(
  channel = channelMenu.value?.channel,
  tab = "overview",
) {
  if (!channel) return;
  channelSettingsForm.value = {
    ...channel,
    categoryId: channel.category_id || null,
    slowmodeSeconds: channel.slowmode_seconds || 0,
      contentVisibility: channel.content_visibility || "default",
    announcement: Boolean(channel.announcement),
    voiceCodec: channel.voice_codec || "opus",
    voiceBitrate: channel.voice_bitrate || 64000,
    voiceSampleRate: channel.voice_sample_rate || 48000,
    nsfw: Boolean(channel.nsfw),
  };
  channelSettingsTab.value = tab;
  channelSettingsOpen.value = true;
  channelMenu.value = null;
  saved.value = "";
  const [roles, invites, webhooks] = await Promise.all([
    api(`/api/v1/guilds/${activeCommunity.value.id}/roles`),
    api(`/api/v1/guilds/${activeCommunity.value.id}/invites`),
    api(`/api/v1/guilds/${activeCommunity.value.id}/webhooks`),
  ]);
  guildRoles.value = roles.roles;
  guildInvites.value = invites.invites;
  guildWebhooks.value = webhooks.webhooks;
  channelPermissionOverrides.value = (await api(`/api/v1/guilds/${activeCommunity.value.id}/permission-overrides`)).overrides || [];
  channelPermissionTarget.value = guildRoles.value.find((role) => role.managed)?.id || "everyone";
}
const channelPermissionRules = [
  { name: "View Channel", description: "Allows members to view this channel.", bit: 1024n },
  { name: "Send Messages", description: "Allows members to send messages in this channel.", bit: 2048n },
  { name: "Connect", description: "Allows members to connect to this voice channel.", bit: 1048576n },
  { name: "Manage Channel", description: "Allows members to edit or delete this channel.", bit: 16n },
  { name: "Manage Permissions", description: "Allows members to change channel permissions.", bit: 268435456n },
  { name: "Manage Webhooks", description: "Allows members to manage webhooks in this channel.", bit: 536870912n },
  { name: "Create Invite", description: "Allows members to create channel invites.", bit: 1n },
];
function selectedPermissionOverride() {
  return channelPermissionOverrides.value.find((item) => item.channel_id === channelSettingsForm.value.id && item.target_id === channelPermissionTarget.value);
}
function permissionState(rule) {
  const override = selectedPermissionOverride();
  if (!override) return "neutral";
  const allow = BigInt(override.allow_mask || 0), deny = BigInt(override.deny_mask || 0);
  return deny & rule.bit ? "deny" : allow & rule.bit ? "allow" : "neutral";
}
async function cyclePermission(rule) {
  const current = permissionState(rule), next = current === "neutral" ? "allow" : current === "allow" ? "deny" : "neutral";
  let allow = BigInt(selectedPermissionOverride()?.allow_mask || 0), deny = BigInt(selectedPermissionOverride()?.deny_mask || 0);
  allow &= ~rule.bit; deny &= ~rule.bit;
  if (next === "allow") allow |= rule.bit; if (next === "deny") deny |= rule.bit;
  const id = `${channelSettingsForm.value.id}:${channelPermissionTarget.value}`;
  const result = await api(`/api/v1/guilds/${activeCommunity.value.id}/permission-overrides/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ channelId: channelSettingsForm.value.id, targetType: "role", targetId: channelPermissionTarget.value, allowMask: allow.toString(), denyMask: deny.toString() }) });
  const index = channelPermissionOverrides.value.findIndex((item) => item.id === result.override.id);
  if (index >= 0) channelPermissionOverrides.value[index] = result.override; else channelPermissionOverrides.value.push(result.override);
  emitCommunityChanged(activeCommunity.value?.id);
}
async function saveChannelSettings() {
  const form = channelSettingsForm.value;
  const result = await api(`/api/v1/channels/${form.id}`, {
    method: "PATCH",
    body: JSON.stringify(form),
  });
  const channel = activeCommunity.value.channels.find(
    (item) => item.id === form.id,
  );
  if (channel) Object.assign(channel, result.channel);
  if (selected.value?.id === form.id) selected.value = channel;
  channelSettingsForm.value = {
    ...result.channel,
    categoryId: result.channel.category_id,
    slowmodeSeconds: result.channel.slowmode_seconds,
    contentVisibility: result.channel.content_visibility,
    announcement: Boolean(result.channel.announcement),
    nsfw: Boolean(result.channel.nsfw),
    voiceCodec: result.channel.voice_codec || "opus",
    voiceBitrate: result.channel.voice_bitrate || 64000,
    voiceSampleRate: result.channel.voice_sample_rate || 48000,
  };
  saved.value = "Channel saved";
  emitCommunityChanged(activeCommunity.value?.id);
}
async function duplicateChannel() {
  const source = channelMenu.value.channel;
  const result = await api(
    `/api/v1/guilds/${activeCommunity.value.id}/channels`,
    {
      method: "POST",
      body: JSON.stringify({ name: `${source.name}-copy`, kind: source.kind }),
    },
  );
  activeCommunity.value.channels.push(result.channel);
  emitCommunityChanged(activeCommunity.value?.id);
  channelMenu.value = null;
}
async function copyChannelValue(kind) {
  const channel = channelMenu.value.channel;
  const value =
    kind === "id"
      ? channel.id
      : `${location.origin}/channels/${activeCommunity.value.id}/${channel.id}`;
  await navigator.clipboard.writeText(value);
  channelMenu.value = null;
  saved.value = kind === "id" ? "Channel ID copied" : "Channel link copied";
}
function pinChannel() {
  const channel = channelMenu.value.channel;
  const channels = activeCommunity.value.channels;
  activeCommunity.value.channels = [
    channel,
    ...channels.filter((item) => item.id !== channel.id),
  ];
  channelMenu.value = null;
}
async function toggleChannelMute() {
  const id = channelMenu.value.channel.id;
  const muted = new Set(settings.value.mutedChannels || []);
  muted.has(id) ? muted.delete(id) : muted.add(id);
  settings.value.mutedChannels = [...muted];
  channelMenu.value = null;
  await saveSettings();
}
async function removeChannel() {
  if (!confirm(`Delete #${channelMenu.value.channel.name}?`)) return;
  await api(`/api/v1/channels/${channelMenu.value.channel.id}`, {
    method: "DELETE",
  });
  activeCommunity.value.channels = activeCommunity.value.channels.filter(
    (item) => item.id !== channelMenu.value.channel.id,
  );
  emitCommunityChanged(activeCommunity.value?.id);
  channelMenu.value = null;
}
async function deleteEditedChannel() {
  channelMenu.value = { channel: channelSettingsForm.value };
  await removeChannel();
  channelSettingsOpen.value = false;
}
async function openGuildSettings(tab = "overview") {
  guildForm.value = {
    name: activeCommunity.value.name,
    description: activeCommunity.value.description,
    iconUrl: activeCommunity.value.icon_url || "",
    bannerUrl: activeCommunity.value.banner_url || "",
    profile: {
      bannerColor: activeCommunity.value.profile?.bannerColor || "#7857ff",
      memberTag: activeCommunity.value.profile?.memberTag || "",
      memberTagEmoji: activeCommunity.value.profile?.memberTagEmoji || "",
      traits: [
        ...(activeCommunity.value.profile?.traits || []),
        "",
        "",
        "",
        "",
        "",
      ].slice(0, 5),
      safety: {
        mediaFilter:
          activeCommunity.value.profile?.safety?.mediaFilter !== false,
        requireVerifiedEmail:
          activeCommunity.value.profile?.safety?.requireVerifiedEmail !== false,
        blockMentionSpam:
          activeCommunity.value.profile?.safety?.blockMentionSpam !== false,
      },
      onboarding: {
        enabled: Boolean(activeCommunity.value.profile?.onboarding?.enabled),
        welcome: activeCommunity.value.profile?.onboarding?.welcome || "",
        defaultChannelId:
          activeCommunity.value.profile?.onboarding?.defaultChannelId || "",
      },
      atmosphere: {
        mode: activeCommunity.value.profile?.atmosphere?.mode || "gradient",
        start: activeCommunity.value.profile?.atmosphere?.start || "#071426",
        end: activeCommunity.value.profile?.atmosphere?.end || "#32145f",
        angle: activeCommunity.value.profile?.atmosphere?.angle || 135,
        glass: activeCommunity.value.profile?.atmosphere?.glass || 72,
        backgroundUrl:
          activeCommunity.value.profile?.atmosphere?.backgroundUrl || "",
      },
    },
  };
  guildSettingsDialog.value = true;
  guildSettingsTab.value = tab;
  error.value = "";
  saved.value = "";
  const id = activeCommunity.value.id;
  try {
    const [roles, invites, categories, members, webhooks, emojis] =
      await Promise.all([
        api(`/api/v1/guilds/${id}/roles`),
        api(`/api/v1/guilds/${id}/invites`),
        api(`/api/v1/guilds/${id}/categories`),
        api(`/api/v1/guilds/${id}/members`),
        api(`/api/v1/guilds/${id}/webhooks`),
        api(`/api/v1/emojis?guildId=${id}`),
      ]);
    guildRoles.value = roles.roles;
    selectedRole.value = guildRoles.value.length
      ? { ...guildRoles.value[0] }
      : null;
    guildInvites.value = invites.invites;
    guildCategories.value = categories.categories;
    guildMembers.value = members.members;
    guildWebhooks.value = webhooks.webhooks;
    guildEmojis.value = emojis.guild_emojis;
  } catch (e) {
    error.value = e.message;
  }
}
async function addRole() {
  const permissions = roleForm.value.permissions
    .reduce((mask, value) => mask | BigInt(value), 0n)
    .toString();
  const result = await api(`/api/v1/guilds/${activeCommunity.value.id}/roles`, {
    method: "POST",
    body: JSON.stringify({ ...roleForm.value, permissions }),
  });
  guildRoles.value.push(result.role);
  emitCommunityChanged(activeCommunity.value?.id);
  selectedRole.value = { ...result.role };
  roleEditorTab.value = "display";
  roleForm.value = { name: "", color: "#99aab5", permissions: [] };
}
function editRole(role) {
  selectedRole.value = { ...role };
  roleEditorTab.value = "display";
}
function roleHasPermission(value) {
  return Boolean(BigInt(selectedRole.value?.permissions || 0) & BigInt(value));
}
function toggleRolePermission(value) {
  if (selectedRole.value.managed) return;
  const mask = BigInt(selectedRole.value.permissions || 0);
  const bit = BigInt(value);
  selectedRole.value.permissions = (
    mask & bit ? mask & ~bit : mask | bit
  ).toString();
}
async function saveRole() {
  if (selectedRole.value.managed) return;
  const result = await api(
    `/api/v1/guilds/${activeCommunity.value.id}/roles/${selectedRole.value.id}`,
    { method: "PATCH", body: JSON.stringify(selectedRole.value) },
  );
  const index = guildRoles.value.findIndex(
    (role) => role.id === result.role.id,
  );
  guildRoles.value[index] = result.role;
  selectedRole.value = { ...result.role };
  saved.value = "Role saved";
  emitCommunityChanged(activeCommunity.value?.id);
}
async function addInvite() {
  const result = await api(
    `/api/v1/guilds/${activeCommunity.value.id}/invites`,
    { method: "POST", body: JSON.stringify(inviteForm.value) },
  );
  guildInvites.value.push(result.invite);
  emitCommunityChanged(activeCommunity.value?.id);
}
async function addWebhook() {
  const result = await api(
    `/api/v1/guilds/${activeCommunity.value.id}/webhooks`,
    { method: "POST", body: JSON.stringify(webhookForm.value) },
  );
  guildWebhooks.value.push(result.webhook);
  emitCommunityChanged(activeCommunity.value?.id);
  webhookForm.value = { name: "", channelId: "" };
}
async function addCategory() {
  const result = await api(
    `/api/v1/guilds/${activeCommunity.value.id}/categories`,
    { method: "POST", body: JSON.stringify({ name: categoryName.value }) },
  );
  guildCategories.value.push(result.category);
  emitCommunityChanged(activeCommunity.value?.id);
  categoryName.value = "";
}
async function renameCategory(category) {
  const name = prompt("Category name", category.name)?.trim();
  if (!name || name === category.name) return;
  const result = await api(`/api/v1/categories/${category.id}`, { method: "PATCH", body: JSON.stringify({ guildId: activeCommunity.value.id, name, position: category.position }) });
  Object.assign(category, result.category); emitCommunityChanged(activeCommunity.value?.id);
}
async function removeCategory(category) {
  if (!confirm(`Delete ${category.name}? Channels will be uncategorized.`)) return;
  await api(`/api/v1/categories/${category.id}?guildId=${encodeURIComponent(activeCommunity.value.id)}`, { method: "DELETE" });
  guildCategories.value = guildCategories.value.filter((item) => item.id !== category.id);
  for (const channel of activeCommunity.value.channels)
    if (channel.category_id === category.id) channel.category_id = null;
  emitCommunityChanged(activeCommunity.value?.id);
}
async function moveChannel(channel, target) {
  if (!target || channel.id === target.id) return;
  const channels = activeCommunity.value.channels.slice().sort((a, b) => (a.position || 0) - (b.position || 0));
  const from = channels.findIndex((item) => item.id === channel.id), to = channels.findIndex((item) => item.id === target.id);
  if (from < 0 || to < 0) return;
  channels.splice(from, 1); channels.splice(to, 0, channel);
  await api(`/api/v1/guilds/${activeCommunity.value.id}/channels/order`, {
    method: "PUT",
    body: JSON.stringify({ channels: channels.map((item) => ({ id: item.id, categoryId: item.category_id || null })) }),
  });
  channels.forEach((item, index) => { item.position = index; });
  activeCommunity.value.channels = channels;
  emitCommunityChanged(activeCommunity.value?.id);
}
async function moveChannelToCategory(channel, categoryId = null) {
  if (!channel || (channel.category_id || null) === categoryId) return;
  const previous = channel.category_id || null;
  channel.category_id = categoryId;
  try {
    const channels = [...activeCommunity.value.channels].sort((a, b) => (a.position || 0) - (b.position || 0));
    await api(`/api/v1/guilds/${activeCommunity.value.id}/channels/order`, {
      method: "PUT",
      body: JSON.stringify({ channels: channels.map((item) => ({ id: item.id, categoryId: item.category_id || null })) }),
    });
    emitCommunityChanged(activeCommunity.value?.id);
  } catch (moveError) {
    channel.category_id = previous;
    error.value = moveError.message;
  }
}
async function saveGuild() {
  try {
    const result = await api(`/api/v1/guilds/${activeCommunity.value.id}`, {
      method: "PATCH",
      body: JSON.stringify(guildForm.value),
    });
    Object.assign(activeCommunity.value, result.guild);
    emitCommunityChanged(activeCommunity.value?.id);
    saved.value = "Server settings saved";
  } catch (e) {
    error.value = e.message;
  }
}
async function uploadCommunityBackground() {
  if (!communityBackgroundFile.value) return;
  const form = new FormData();
  form.append("image", communityBackgroundFile.value);
  try {
    const response = await fetch(
      apiEndpoint(`/api/v1/guilds/${activeCommunity.value.id}/background`),
      { method: "POST", credentials: "include", body: form },
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Upload failed");
    Object.assign(activeCommunity.value, result.guild);
    emitCommunityChanged(activeCommunity.value?.id);
    guildForm.value.profile.atmosphere = {
      ...guildForm.value.profile.atmosphere,
      ...result.guild.profile.atmosphere,
    };
    saved.value = "Community background uploaded";
  } catch (uploadError) {
    error.value = uploadError.message;
  }
}
async function uploadCommunityMedia(kind, file) {
  if (!file) return;
  const form = new FormData();
  form.append("image", file);
  try {
    const response = await fetch(apiEndpoint(`/api/v1/guilds/${activeCommunity.value.id}/media/${kind}`), { method: "POST", credentials: "include", body: form });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Upload failed");
    Object.assign(activeCommunity.value, result.guild);
    if (kind === "icon") guildForm.value.iconUrl = result.asset.url;
    else guildForm.value.bannerUrl = result.asset.url;
    emitCommunityChanged(activeCommunity.value?.id);
    saved.value = `${kind === "icon" ? "Server icon" : "Server banner"} uploaded`;
  } catch (uploadError) {
    error.value = uploadError.message;
  }
}
async function addChannel() {
  try {
    const result = await api(
      `/api/v1/guilds/${activeCommunity.value.id}/channels`,
      { method: "POST", body: JSON.stringify(channelForm.value) },
    );
    activeCommunity.value.channels.push(result.channel);
    emitCommunityChanged(activeCommunity.value?.id);
    channelForm.value = { name: "", kind: "text" };
  } catch (e) {
    error.value = e.message;
  }
}
async function addPeer() {
  error.value = "";
  try {
    const peer = await api("/api/admin/federation", {
      method: "POST",
      body: JSON.stringify(peerForm.value),
    });
    peers.value.push(peer);
    peerForm.value = { name: "", baseUrl: "", status: "pending" };
  } catch (e) {
    error.value = e.message;
  }
}
async function savePeer(peer) {
  try {
    const saved = await api(`/api/admin/federation/${peer.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: peer.name,
        baseUrl: peer.base_url,
        status: peer.status,
      }),
    });
    Object.assign(peer, saved);
  } catch (e) {
    error.value = e.message;
  }
}
async function checkPeer(peer) {
  peer.checking = true;
  try {
    const result = await api(`/api/admin/federation/${peer.id}/check`);
    peer.health = `Online · ${result.latency_ms} ms`;
  } catch (e) {
    peer.health = `Unavailable · ${e.message}`;
  } finally {
    peer.checking = false;
  }
}
async function removePeer(peer) {
  if (!confirm(`Remove ${peer.name}?`)) return;
  await api(`/api/admin/federation/${peer.id}`, { method: "DELETE" });
  peers.value = peers.value.filter((item) => item.id !== peer.id);
}
async function toggleMic() {
  micMuted.value = !micMuted.value;
  if (voiceRoom.value)
    await voiceRoom.value.localParticipant.setMicrophoneEnabled(
      !micMuted.value,
      settings.value.inputDeviceId
        ? { deviceId: settings.value.inputDeviceId }
        : undefined,
    );
}
function toggleDeafen() {
  deafened.value = !deafened.value;
  if (deafened.value && !micMuted.value) toggleMic();
  document
    .querySelectorAll("#remote-audio audio")
    .forEach((element) => (element.muted = deafened.value));
}
function setProfileForm(profile) {
  profileName.value = profile.display_name;
  profileUsername.value = profile.username;
  profileAvatar.value = profile.avatar_url || "";
  profileBanner.value = profile.banner_url || "";
  profileBio.value = profile.bio || "";
  profileAccent.value = profile.accent_color || "#7857ff";
  profileCss.value = profile.profile_css || "";
}
async function openSettings() {
  settingsOpen.value = true;
  settingsTab.value = "profile";
  error.value = "";
  saved.value = "";
  setProfileForm(user.value);
  try {
    const catalog = await api("/api/v1/home/federated");
    publishedItems.value = catalog.items;
    const devices = await navigator.mediaDevices.enumerateDevices();
    audioDevices.value = {
      inputs: devices.filter((d) => d.kind === "audioinput"),
      outputs: devices.filter((d) => d.kind === "audiooutput"),
    };
    videoDevices.value = devices.filter((d) => d.kind === "videoinput");
  } catch {
    audioDevices.value = { inputs: [], outputs: [] };
    videoDevices.value = [];
  }
}
async function openProfile(id, mode = "compact") {
  try {
    if (!publishedItems.value.length)
      publishedItems.value = (await api("/api/v1/home/federated")).items;
    const guildId = activeCommunity.value?.id
      ? `?guildId=${encodeURIComponent(activeCommunity.value.id)}`
      : "";
    activeProfile.value = (
      await api(`/api/users/${id}/profile${guildId}`)
    ).profile;
    activeProfileMode.value = mode;
    userMenu.value = null;
  } catch (e) {
    error.value = e.message;
  }
}
function editStatus() {
  statusDraft.value = {
    status: settings.value.status || "online",
    text: settings.value.statusText || "",
  };
  statusEditorOpen.value = true;
}
async function saveStatus() {
  settings.value.status = statusDraft.value.status;
  settings.value.statusText = statusDraft.value.text.trim().slice(0, 128);
  await saveSettings();
  if (activeProfile.value?.id === user.value.id) {
    activeProfile.value.status = settings.value.status;
    activeProfile.value.status_text = settings.value.statusText;
  }
  const member = guildMembers.value.find((item) => item.id === user.value.id);
  if (member) {
    member.presence_status = settings.value.status;
    member.status_text = settings.value.statusText;
  }
  statusEditorOpen.value = false;
}
function showUserMenu(event, subject) {
  event.preventDefault();
  channelMenu.value = null;
  appMenu.value = null;
  userMenu.value = {
    id: subject.id || subject.author_id,
    name: subject.username || subject.author_name,
    x: Math.max(8, Math.min(event.clientX, window.innerWidth - 210)),
    y: Math.max(8, Math.min(event.clientY, window.innerHeight - 330)),
  };
}
function mentionUser() {
  const name = userMenu.value?.name || activeProfile.value?.username;
  if (!name) return;
  draft.value += `${draft.value ? " " : ""}@${name} `;
  userMenu.value = null;
  activeProfile.value = null;
}
async function copyUserId() {
  await navigator.clipboard.writeText(userMenu.value.id);
  userMenu.value = null;
  saved.value = "User ID copied";
}
async function copyOwnProfileId() {
  await navigator.clipboard.writeText(activeProfile.value.id);
  saved.value = "User ID copied";
}
function openImageCrop(kind, event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  cropper.value = { kind, file, url: URL.createObjectURL(file) };
  cropZoom.value = 1;
}
function closeImageCrop() {
  if (cropper.value?.url) URL.revokeObjectURL(cropper.value.url);
  cropper.value = null;
}
async function confirmImageCrop() {
  const current = cropper.value;
  if (!current) return;
  // Canvas encoding would flatten an animated GIF into one frame. Preserve
  // the original animation when the user has not requested a transformation.
  if (current.file.type === "image/gif" && cropZoom.value === 1) {
    const kind = current.kind;
    const file = current.file;
    closeImageCrop();
    if (kind === "avatar" || kind === "banner") await uploadProfileImage(kind, file);
    else await uploadCommunityMedia(kind.replace("community-", ""), file);
    return;
  }
  const image = new Image();
  image.src = current.url;
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
  const ratio = current.kind.includes("banner") ? 3 : 1;
  const width = current.kind.includes("banner") ? 1200 : 512;
  const height = Math.round(width / ratio);
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * cropZoom.value;
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(image, (width - image.naturalWidth * scale) / 2, (height - image.naturalHeight * scale) / 2, image.naturalWidth * scale, image.naturalHeight * scale);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", .9));
  if (!blob) return;
  const file = new File([blob], `${current.kind}.jpg`, { type: "image/jpeg" });
  const kind = current.kind;
  closeImageCrop();
  if (kind === "avatar" || kind === "banner") await uploadProfileImage(kind, file);
  else await uploadCommunityMedia(kind.replace("community-", ""), file);
}
async function uploadProfileImage(kind, file) {
  error.value = "";
  uploading.value = kind;
  try {
    const form = new FormData();
    form.append("image", file);
    const response = await fetch(apiEndpoint(`/api/users/me/images/${kind}`), {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Upload failed");
    user.value = result.user;
    setProfileForm(result.user);
    socket.emit("profile:updated");
    saved.value = `${kind === "avatar" ? "Avatar" : "Banner"} uploaded`;
  } catch (e) {
    error.value = e.message;
  } finally {
    uploading.value = "";
  }
}
function applyAppearance() {
  const root = document.documentElement;
  const preferredTheme = settings.value.theme === "system"
    ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : settings.value.theme;
  root.dataset.theme = preferredTheme;
  root.dataset.density = settings.value.density || (settings.value.compact ? "compact" : "default");
  root.dataset.messageSpacing = settings.value.messageSpacing || "comfortable";
  root.style.setProperty("--lc-accent", settings.value.accentColor || "#8b5cf6");
  root.style.setProperty("--lc-text-scale", `${settings.value.textSize || 100}%`);
  root.classList.toggle("compact", settings.value.compact || settings.value.density === "compact");
  root.classList.toggle("reduce-motion", Boolean(settings.value.reducedMotion));
  root.classList.toggle("high-contrast", Boolean(settings.value.increasedContrast));
  root.classList.toggle("reduce-transparency", Boolean(settings.value.reducedTransparency));
}
async function saveSettings() {
  error.value = "";
  saved.value = "";
  try {
    if (settings.value.notifications && typeof Notification !== "undefined" && Notification.permission === "default")
      await Notification.requestPermission();
    if (isDesktopApp && window.libracordDesktop?.setHardwareAcceleration)
      await window.libracordDesktop.setHardwareAcceleration(settings.value.hardwareAcceleration);
    const result = await api("/api/users/me", {
      method: "PUT",
      body: JSON.stringify({
        username: profileUsername.value,
        displayName: profileName.value,
        avatarUrl: profileAvatar.value,
        bannerUrl: profileBanner.value,
        bio: profileBio.value,
        accentColor: profileAccent.value,
        profileCss: profileCss.value,
        settings: settings.value,
      }),
    });
    user.value = result.user;
    setProfileForm(result.user);
    settings.value = { ...settings.value, ...result.user.settings };
    socket.emit("profile:updated");
    applyAppearance();
    document.querySelectorAll("#remote-audio audio").forEach((element) => {
      element.volume = settings.value.outputVolume / 100;
      if (settings.value.outputDeviceId && element.setSinkId)
        element.setSinkId(settings.value.outputDeviceId).catch(() => {});
    });
    saved.value = "Settings saved";
  } catch (e) {
    error.value = e.message;
  }
}
async function changePassword() {
  error.value = "";
  saved.value = "";
  try {
    await api("/api/users/me/password", {
      method: "PUT",
      body: JSON.stringify({
        currentPassword: passwords.value.current,
        newPassword: passwords.value.next,
      }),
    });
    passwords.value = { current: "", next: "" };
    saved.value = "Password changed";
  } catch (e) {
    error.value = e.message;
  }
}
socket.on("message:created", (message) => {
  const isOwnMessage = message.author_id === user.value?.id;
  const isActiveChannel = page.value === "chat" && message.channel_id === selected.value?.id;
  if (
    isActiveChannel &&
    !messages.value.some((item) => item.id === message.id)
  )
    messages.value.push(message);
  else if (!isOwnMessage) {
    playUiSound("message");
    unreadChannels.value = { ...unreadChannels.value, [message.channel_id]: (unreadChannels.value[message.channel_id] || 0) + 1 };
    const channel = communities.value.flatMap((guild) => guild.channels || []).find((item) => item.id === message.channel_id);
    if (channel) unreadCommunities.value = { ...unreadCommunities.value, [channel.community_id]: true };
    showDesktopNotification(message.author_name || "New message", message.body || "New attachment", async () => {
      const target = communities.value.flatMap((guild) => guild.channels || []).find((item) => item.id === message.channel_id);
      if (target) await selectChannel(target);
    });
  }
});
socket.on("voice:message:created", (message) => {
  if (message.channel_id === voiceRoom.value?.__channelId && !voiceMessages.value.some((item) => item.id === message.id))
    voiceMessages.value.push(message);
});
socket.on("voice:presence-changed", (communityId) => {
  if (String(communityId) === String(activeCommunityId.value)) refreshVoicePresence();
});
socket.on("profile:updated", async ({ userId } = {}) => {
  if (!activeCommunityId.value) return;
  try {
    const result = await api(`/api/v1/guilds/${encodeURIComponent(activeCommunityId.value)}/members`);
    guildMembers.value = result.members || [];
    if (activeProfile.value?.id === userId) await openProfile(userId, activeProfileMode.value);
  } catch {
    // A profile update should never interrupt the current session.
  }
});
socket.on("community:changed", ({ communityId } = {}) => {
  refreshCommunityFromServer(communityId);
});
socket.on("federation:membership", async () => {
  communities.value = (await api("/api/v1/guilds")).guilds || [];
  if (homeTab.value === "discover") discoverCommunities.value = (await api("/api/v1/discovery/communities")).communities;
});
socket.on("federation:community-deleted", async () => {
  communities.value = (await api("/api/v1/guilds")).guilds || [];
});
socket.on("federation:community-changed", async () => {
  communities.value = (await api("/api/v1/guilds")).guilds || [];
});
socket.on("dm:created", async (message) => {
  const otherId = message.sender_id === user.value.id ? message.recipient_id : message.sender_id;
  const isOwnMessage = message.sender_id === user.value.id;
  const isActiveDm = page.value === "home" && homeTab.value === "dm" && dmTarget.value?.id === otherId;
  if (!isActiveDm && !isOwnMessage) {
    dmUnread.value += 1;
    const sender = friends.value.find((friend) => friend.id === otherId) || openDmUsers.value.find((friend) => friend.id === otherId) || {
      id: otherId, username: message.username || "system", display_name: message.author_name || "LibraCord System",
      avatar_url: message.avatar_url || "", banner_url: message.banner_url || "", system: message.kind === "system",
    };
    if (!openDmUsers.value.some((contact) => contact.id === sender.id)) openDmUsers.value.unshift(sender);
    showDesktopNotification(message.author_name || sender?.display_name || "New direct message", message.kind === "system" ? "Official message from your LibraCord instance." : "Open LibraCord to read this encrypted message.", () => {
      openDm(sender);
    });
    playUiSound("message");
    return;
  }
  const decrypted = await decryptDm(message.body, otherId);
  if (!dmMessages.value.some((item) => item.id === message.id)) dmMessages.value.push({ ...message, body: decrypted });
});
socket.on("dm:encrypted", (message) => {
  dmUnread.value += 1;
  const sender = String(message?.sender_global_id || "Remote user");
  showDesktopNotification(`Encrypted message from ${sender}`, "Open LibraCord to verify the sender key and decrypt this message.", () => openHome("dm"));
  playUiSound("message");
});
socket.on("moderation:report-created", async () => {
  if (page.value === "admin" && adminTab.value === "moderation") adminModeration.value = await api("/api/v1/admin/moderation");
});
socket.on("account:banned", ({ reason } = {}) => {
  error.value = `Your account was banned: ${reason || "Contact the instance administrator."}`;
  connectionState.value = "disconnected";
  connectionDetail.value = "Account banned";
  socket.disconnect();
  user.value = null;
  appBooting.value = false;
});
socket.on("dm:call-invite", ({ callerId, callerName, mode, callId } = {}) => {
  incomingDmCall.value = { callerId, callerName, mode: mode || "video", callId };
  playUiSound("message");
  showDesktopNotification(`${callerName || "Someone"} is calling`, `Incoming ${mode || "video"} call`, () => window.focus());
});
socket.on("dm:call-response", async ({ fromId, accepted } = {}) => { if (accepted && dmTarget.value?.id === fromId) { try { await joinDmCall(fromId); } catch (e) { error.value = e.message; } } });
socket.on("dm:typing", ({ userId, name, typing } = {}) => {
  if (!dmTarget.value || userId !== dmTarget.value.id) return;
  dmTypingUsers.value = typing ? [name || dmTarget.value.display_name] : [];
});
socket.on("typing:update", ({ channelId, userId, name, typing }) => {
  const current = { ...(typingUsers.value[channelId] || {}) };
  if (typing) current[userId] = name || "Someone"; else delete current[userId];
  typingUsers.value = { ...typingUsers.value, [channelId]: current };
});
socket.on("connect", () => {
  connectionState.value = "connected";
  connectionDetail.value = "Connected";
  if (voiceRoom.value?.__channelId) socket.emit("voice-chat:join", voiceRoom.value.__channelId);
});
socket.on("disconnect", (reason) => {
  if (reason === "io client disconnect") return;
  connectionState.value = navigator.onLine === false ? "offline" : "reconnecting";
  connectionDetail.value = navigator.onLine === false
    ? "Your internet connection is offline."
    : "Connection lost. Retrying…";
});
socket.on("connect_error", () => {
  connectionState.value = navigator.onLine === false ? "offline" : "reconnecting";
  connectionDetail.value = navigator.onLine === false
    ? "Your internet connection is offline."
    : "The server is unavailable. Retrying…";
});
onMounted(async () => {
  window.addEventListener("keydown", handleLightboxKey);
  try {
    const codecs = window.RTCRtpSender?.getCapabilities?.("audio")?.codecs || [];
    const seen = new Set();
    supportedVoiceCodecs.value = codecs.filter((codec) => /audio\/|opus|pcmu|pcma|g722/i.test(codec.mimeType || "") && !seen.has(codec.mimeType)).map((codec) => { seen.add(codec.mimeType); return { value: codec.mimeType.split("/")[1].toLowerCase(), label: codec.mimeType.split("/")[1].toUpperCase() }; });
    if (!supportedVoiceCodecs.value.length) supportedVoiceCodecs.value = [{ value: "opus", label: "Opus" }];
  } catch {}
  document.addEventListener("contextmenu", showAppMenu);
  try {
    const result = await api("/api/auth/me");
    if (result.user) await beginSession(result.user);
    connectionState.value = "connected";
    connectionDetail.value = "Connected";
  } catch (e) {
    error.value = e.message;
    connectionState.value = navigator.onLine === false ? "offline" : "reconnecting";
    connectionDetail.value = navigator.onLine === false ? "Your internet connection is offline." : "The server is unavailable.";
  } finally {
    appBooting.value = false;
  }
  window.addEventListener("online", retryConnection);
  window.addEventListener("offline", () => {
    connectionState.value = "offline";
    connectionDetail.value = "Your internet connection is offline.";
  });
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleLightboxKey);
  clearInterval(networkTimer);
  dockObserver?.disconnect();
  document.removeEventListener("contextmenu", showAppMenu);
  window.removeEventListener("online", retryConnection);
  socket.disconnect();
  leaveVoice();
});
watch(user, () => nextTick(setupCommunityDock));
watch([page, homeTab, activeCommunityId, selected, dmTarget], () => {
  if (!user.value) return;
  localStorage.setItem(`libracord-navigation:${serverOrigin || location.origin}:${user.value.id}`, JSON.stringify({
    page: page.value,
    homeTab: homeTab.value,
    communityId: activeCommunityId.value,
    channelId: selected.value?.id || null,
    dmUserId: dmTarget.value?.id || null,
  }));
}, { deep: true });
watch([unreadChannels, unreadCommunities, dmUnread], () => {
  if (!user.value) return;
  localStorage.setItem(`libracord-unread:${serverOrigin || location.origin}:${user.value.id}`, JSON.stringify({
    channels: unreadChannels.value,
    communities: unreadCommunities.value,
    dms: dmUnread.value,
  }));
}, { deep: true });
watch(compactCommunityDock, () => nextTick(updateDockScroll));
watch(communities, () => nextTick(updateDockScroll), { deep: true });
watch(
  messages,
  () =>
    requestAnimationFrame(() =>
      document.querySelector(".messages")?.scrollTo(0, 999999),
    ),
  { deep: true },
);
</script>

<template>
  <div
    v-if="appBooting || connectionState !== 'connected'"
    class="connection-overlay"
    :class="`connection-${connectionState}`"
    role="status"
    aria-live="polite"
  >
    <div class="connection-card">
      <div class="connection-spinner" aria-hidden="true"></div>
      <p class="connection-eyebrow">LIBRACORD</p>
      <h2>{{ connectionState === "offline" ? "You’re offline" : connectionState === "reconnecting" ? "Reconnecting…" : "Connecting…" }}</h2>
      <p>{{ connectionDetail }}</p>
      <button v-if="!appBooting" class="primary" :disabled="connectionRetrying" @click="retryConnection">
        {{ connectionRetrying ? "Trying again…" : "Try again" }}
      </button>
    </div>
  </div>
  <main v-if="!user" class="auth-page">
    <form class="auth-card" @submit.prevent="submitAuth">
      <div class="brand">L</div>
      <h1>
        {{ authMode === "login" ? "Welcome back" : "Create your account" }}
      </h1>
      <p>
        {{
          authMode === "login"
            ? "Sign in to your LibraCord instance."
            : "The first account becomes the instance owner."
        }}
      </p>
      <label
        >Email<input
          v-model="auth.email"
          type="email"
          autocomplete="email"
          required /></label
      ><label v-if="authMode === 'register'"
        >Username<input
          v-model="auth.username"
          autocomplete="username"
          minlength="3"
          maxlength="32"
          pattern="[a-z0-9][a-z0-9_.-]{2,31}"
          required /></label
      ><label v-if="authMode === 'register'"
        >Display name<input
          v-model="auth.displayName"
          autocomplete="nickname"
          maxlength="64"
          required /></label
      ><label
        >Password<input
          v-model="auth.password"
          type="password"
          :autocomplete="
            authMode === 'login' ? 'current-password' : 'new-password'
          "
          minlength="10"
          required
      /></label>
      <div v-if="error" class="error">{{ error }}</div>
      <button class="primary" :disabled="busy">
        {{
          busy ? "Please wait…" : authMode === "login" ? "Sign in" : "Register"
        }}</button
      ><button
        type="button"
        class="link"
        @click="
          authMode = authMode === 'login' ? 'register' : 'login';
          error = '';
        "
      >
        {{
          authMode === "login"
            ? "Need an account? Register"
            : "Already registered? Sign in"
        }}
      </button>
    </form>
  </main>
  <main
    v-else
    class="shell libracord-canvas bg-slate-950 text-slate-100"
    :class="{ compact: settings.compact, 'members-collapsed': !membersPanelOpen }"
    :style="communityAtmosphereStyle"
  >
    <aside class="servers">
      <button
        class="home-orbit"
        :class="{ active: page === 'home' }"
        title="LibraCord Home"
        @click="openHome()"
      >
        <FontAwesomeIcon :icon="faHouse" />
      </button>
      <button class="home-orbit dm-button" :class="{ active: page === 'home' && homeTab === 'dm' }" title="Direct messages" @click="openHome('dm')">
        <FontAwesomeIcon :icon="faComments" /><b v-if="dmUnread" class="dm-unread-badge">{{ dmUnread > 9 ? '9+' : dmUnread }}</b>
      </button>
      <div class="workspace-divider" aria-hidden="true"></div>
      <div class="workspace-list" aria-label="Communities">
        <button
          v-for="guild in communities"
          :key="`rail-${guild.id}`"
          class="workspace-orbit"
          :class="{ active: page === 'chat' && activeCommunity?.id === guild.id, unread: unreadCommunities[guild.id] }"
          :title="guild.name"
          @click="chooseGuild(guild)"
        >
          <img v-if="guild.icon_url" :src="guild.icon_url" alt="" />
          <span v-else>{{ guild.name?.[0]?.toUpperCase() || 'L' }}</span>
          <i v-if="unreadCommunities[guild.id]"></i>
        </button>
      </div>
      <button
        v-if="compactCommunityDock"
        class="dock-arrow"
        :disabled="!dockCanScrollLeft"
        title="Previous communities"
        @click="scrollCommunities(-1)"
      >
        ‹
      </button>
      <div class="community-picker">
        <button class="community-picker-trigger" @click="communityMenuOpen = !communityMenuOpen">
          <span class="community-picker-icon"><img v-if="activeCommunity?.icon_url" :src="activeCommunity.icon_url" alt="" /><b v-else>{{ activeCommunity?.name?.[0]?.toUpperCase() || "L" }}</b></span>
          <strong>{{ activeCommunity?.name || "Choose community" }}</strong><b>⌄</b>
        </button>
        <div v-if="communityMenuOpen" class="community-menu">
          <button v-for="guild in communities" :key="guild.id" :class="{ active: activeCommunity?.id === guild.id, unread: unreadCommunities[guild.id], 'has-community-banner': guild.banner_url }" :style="guild.banner_url ? { '--community-menu-banner': `url(${guild.banner_url})` } : {}" @click="chooseGuild(guild)">
            <span class="community-menu-icon"><img v-if="guild.icon_url" :src="guild.icon_url" alt="" /><b v-else>{{ guild.name[0].toUpperCase() }}</b></span><strong>{{ guild.name }}</strong><small>{{ guild.description || "Community" }}</small>
            <i v-if="unreadCommunities[guild.id]" class="unread-badge">!</i>
          </button>
          <button class="community-create" @click="communityMenuOpen = false; guildDialog = true">
            <span>＋</span><strong>Create community</strong><small>Start a new space</small>
          </button>
        </div>
      </div>
      <div v-if="voiceRoom" class="top-voice-dock">
        <strong>{{ voiceStatus }}</strong>
        <button :title="micMuted ? 'Unmute' : 'Mute'" @click="toggleMic"><FontAwesomeIcon :icon="micMuted ? faMicrophoneSlash : faMicrophone" /></button>
        <button title="Camera" @click="toggleCamera"><FontAwesomeIcon :icon="faCamera" /></button>
        <button title="Share screen" @click="toggleScreenShare"><FontAwesomeIcon :icon="faDisplay" /></button>
        <button title="Side chat" @click="voicePanelOpen = !voicePanelOpen"><FontAwesomeIcon :icon="faComments" /></button>
        <button title="Leave voice" class="hangup" @click="leaveVoice"><FontAwesomeIcon :icon="faPhoneSlash" /></button>
      </div>
      <div class="community-actions">
        <button
          class="server add"
          title="Create community"
          @click="guildDialog = true"
        >
          <FontAwesomeIcon :icon="faPlus" />
        </button>
      </div>
      <button
        v-if="compactCommunityDock"
        class="dock-arrow"
        :disabled="!dockCanScrollRight"
        title="More communities"
        @click="scrollCommunities(1)"
      >
        ›
      </button>
      <footer
        class="themed-user-bar community-account"
        :style="
          user.banner_url
            ? { '--user-banner': `url(${user.banner_url})` }
            : { '--user-banner': user.accent_color }
        "
        @contextmenu.stop="showUserMenu($event, user)"
      >
        <button
          class="avatar-button"
          title="View profile"
          @click="openProfile(user.id, 'self')"
        >
          <img
            v-if="user.avatar_url"
            class="avatar image"
            :src="user.avatar_url"
            alt=""
          />
          <span v-else class="avatar">{{ user.display_name[0] }}</span>
          <span
            v-if="profileDecoration()"
            class="mini-profile-decoration"
            :style="publishedPreviewStyle(profileDecoration())"
            ><img
              v-if="profileDecoration().payload.imageUrl"
              :src="profileDecoration().payload.imageUrl"
              alt=""
            /><b v-else>{{ profileDecoration().payload.icon || "✦" }}</b></span
          >
        </button>
        <div
          class="account"
          role="button"
          tabindex="0"
          @click="openProfile(user.id, 'self')"
          @keydown.enter="openProfile(user.id, 'self')"
        >
          <strong>{{ user.display_name }} <span v-if="communityMemberTag.text" class="community-member-tag"><i>{{ communityMemberTag.emoji }}</i>{{ communityMemberTag.text }}</span></strong
          ><small>{{ user.handle }}</small>
        </div>
        <div class="user-controls">
          <button class="members-toggle" title="Toggle member list" @click="membersPanelOpen = !membersPanelOpen">{{ membersPanelOpen ? "◧" : "▣" }}</button>
          <button
            :class="{ controlActive: micMuted }"
            :title="micMuted ? 'Unmute' : 'Mute'"
            @click="toggleMic"
          >
            <FontAwesomeIcon
              :icon="micMuted ? faMicrophoneSlash : faMicrophone"
            /></button
          ><button
            :class="{ controlActive: deafened }"
            :title="deafened ? 'Undeafen' : 'Deafen'"
            @click="toggleDeafen"
          >
            <FontAwesomeIcon
              :icon="deafened ? faVolumeXmark : faHeadphones"
            /></button
          ><button title="User settings" @click="openSettings">
            <FontAwesomeIcon :icon="faGear" /></button
          ><button title="Sign out" @click="logout">
            <FontAwesomeIcon :icon="faRightFromBracket" />
          </button>
        </div>
      </footer>
    </aside>
    <aside class="channels">
      <header>
        <button
          v-if="page === 'chat'"
          class="guild-settings-trigger"
          title="Server settings"
          @click="openGuildSettings"
        >
          <FontAwesomeIcon :icon="faGear" />
        </button>
        <div v-if="page === 'chat' && activeCommunity?.icon_url" class="community-sidebar-identity">
          <img :src="activeCommunity.icon_url" alt="" />
        </div>
        <h1>
          {{
            page === "home"
              ? "Libra Home"
              : activeCommunity?.name || "LibraCord"
          }}
        </h1>
        <div
          v-if="page === 'chat' && activeCommunity?.banner_url"
          class="community-sidebar-banner"
          :style="{ backgroundImage: `url(${activeCommunity.banner_url})` }"
          aria-hidden="true"
        ></div>
        <p>
          {{
            page === "home"
              ? "Your place across the fediverse"
              : activeCommunity?.description
          }}
        </p>
        <label v-if="page === 'chat'" class="channel-search">
          <FontAwesomeIcon :icon="faHashtag" />
          <span class="sr-only">Browse channels</span>
          <input v-model="channelSearch" placeholder="Browse channels" />
        </label>
      </header>
      <template v-if="page === 'chat'">
        <section v-for="group in sidebarChannelGroups" :key="group.id" class="channel-category-group">
          <span class="label">{{ group.name }}</span>
          <template v-for="channel in group.channels" :key="channel.id">
          <button
            draggable="true"
            @dragstart="draggedChannelId = channel.id"
            @dragover.prevent
            @drop="moveChannel(activeCommunity.channels.find((item) => item.id === draggedChannelId), channel); draggedChannelId = null"
            :class="{ selected: selected?.id === channel.id }"
            @click="selectChannel(channel)"
            @contextmenu.stop="showChannelMenu($event, channel)"
          >
            <b v-if="unreadChannels[channel.id]" class="channel-unread">{{ unreadChannels[channel.id] }}</b>
            <FontAwesomeIcon :icon="channel.kind === 'text' ? faHashtag : faVolumeHigh" />{{ channel.name }}
          </button>
          <div v-if="channel.kind === 'voice' && channelPresence(channel).length" class="voice-channel-members">
            <div v-for="participant in channelPresence(channel)" :key="`sidebar-${channel.id}-${participant.identity}`" class="voice-channel-member" :class="{ speaking: participant.speaking, 'has-banner': participant.banner }" :style="participant.banner ? { '--voice-sidebar-banner': `url(${participant.banner})` } : {}">
              <span class="voice-sidebar-avatar"><img v-if="participant.avatar" :src="participant.avatar" alt="" /><b v-else>{{ participant.name?.[0]?.toUpperCase() || '?' }}</b><i></i></span>
              <strong>{{ participant.name }} <span v-if="communityMemberTag.text" class="community-member-tag"><i>{{ communityMemberTag.emoji }}</i>{{ communityMemberTag.text }}</span></strong>
              <span class="voice-sidebar-activity" :class="{ active: participant.speaking }"><i></i><i></i><i></i></span>
              <span class="voice-sidebar-media"><FontAwesomeIcon v-if="participant.camera" :icon="faCamera" title="Camera on" /><FontAwesomeIcon v-if="participant.screen" :icon="faDisplay" title="Sharing screen" /><FontAwesomeIcon v-if="participant.muted" :icon="faMicrophoneSlash" title="Muted" /></span>
            </div>
          </div>
          </template>
        </section>
      </template
      ><template v-else-if="page === 'admin'"
        ><section>
          <span class="label">ADMINISTRATION</span>
          <button
            :class="{ selected: adminTab === 'instance' }"
            @click="openAdmin('instance')"
          >
            <FontAwesomeIcon :icon="faSliders" />Instance
          </button>
          <button
            :class="{ selected: adminTab === 'users' }"
            @click="openAdmin('users')"
          >
            <FontAwesomeIcon :icon="faUsers" />Users
          </button>
          <button
            :class="{ selected: adminTab === 'federation' }"
            @click="openAdmin('federation')"
          >
            <FontAwesomeIcon :icon="faServer" />Federation
          </button>
          <button
            :class="{ selected: adminTab === 'moderation' }"
            @click="openAdmin('moderation')"
          >
            <FontAwesomeIcon :icon="faShieldHalved" />Moderation
          </button>
          <button @click="page = 'chat'">
            <FontAwesomeIcon :icon="faArrowLeft" />Back to chat
          </button>
        </section></template
      ><template v-else-if="homeTab === 'dm'"
        ><section class="home-navigation dm-open-list">
          <span class="label">DIRECT MESSAGES</span>
          <button v-for="friend in openDmUsers" :key="`open-dm-${friend.id}`" class="dm-nav-contact" :class="{ selected: dmTarget?.id === friend.id, 'has-dm-banner': friend.banner_url }" :style="friend.banner_url ? { '--dm-banner': `url(${friend.banner_url})` } : {}" @click="openDm(friend)">
            <span class="dm-nav-avatar"><img v-if="friend.avatar_url" :src="friend.avatar_url" alt="" />{{ !friend.avatar_url ? friend.display_name[0] : '' }}<i></i></span>
            <span><strong :style="usernameThemeStyle(friend)">{{ friend.display_name }} <span v-if="communityMemberTag.text && !friend.system" class="community-member-tag"><i>{{ communityMemberTag.emoji }}</i>{{ communityMemberTag.text }}</span> <b v-if="friend.system" class="system-badge">SYSTEM</b></strong><small>@{{ friend.username }}</small><em>{{ friend.status_text || (friend.system ? 'Official instance messages' : 'Online') }}</em></span><i class="dm-online-dot"></i>
          </button>
          <p v-if="!openDmUsers.length" class="empty">No open conversations yet.</p>
        </section></template
      ><template v-else
        ><section class="home-navigation">
          <span class="label">HOME</span
          ><button :class="{ selected: homeTab === 'friends' }" @click="openHome('friends')">Friends</button
          ><button
            :class="{ selected: homeTab === 'feed' }"
            @click="openHome('feed')"
          >
            Pulse</button
          ><button
            :class="{ selected: homeTab === 'discover' }"
            @click="openHome('discover')"
          >
            Discover Communities</button
          ><span class="label">PUBLISH & COLLECT</span
          ><button
            :class="{ selected: homeTab === 'themes' }"
            @click="openHome('themes')"
          >
            App Themes</button
          ><button
            :class="{ selected: homeTab === 'decorations' }"
            @click="openHome('decorations')"
          >
            User Decorations</button
          ><button
            :class="{ selected: homeTab === 'profiles' }"
            @click="openHome('profiles')"
          >
            Profile Themes
          </button><button
            :class="{ selected: homeTab === 'usernames' }"
            @click="openHome('usernames')"
          >
            Username Styles &amp; Fonts
          </button>
        </section></template
      >
    </aside>
    <section v-if="page === 'chat'" class="chat" :class="{ 'voice-fullscreen': voiceRoom && selected?.id === voiceRoom.__channelId }">
      <header>
        <div v-if="selected?.kind === 'voice'" class="voice-channel-heading">
          <strong>{{ selected?.name }}</strong>
          <small>{{ voiceRoom ? `${voiceParticipants.length} ${voiceParticipants.length === 1 ? 'person' : 'people'} connected` : `${channelPresence(selected).length} ${channelPresence(selected).length === 1 ? 'person' : 'people'} connected` }}</small>
        </div>
        <div v-else class="text-channel-heading"><strong># {{ selected?.name || "Choose a channel" }}</strong><small>{{ selected?.topic || "Good people. Brighter ideas." }}</small></div
        ><button v-if="focusedVoiceParticipant && voiceRoom && selected?.id === voiceRoom.__channelId" class="voice-back-grid" type="button" @click="focusedVoiceParticipant = null">← Back to grid</button><div v-if="selected?.kind !== 'voice'" class="channel-header-actions"><label><span class="sr-only">Search this channel</span><input v-model="messageSearch" :placeholder="`Search in #${selected?.name || 'channel'}`" /></label><button type="button" title="Toggle member list" aria-label="Toggle member list" @click="membersPanelOpen = !membersPanelOpen"><FontAwesomeIcon :icon="faUsers" /></button></div><span v-else>LibraCord</span>
      </header>
      <div v-if="voiceRoom" class="voice-presence-rail">
        <button
          v-for="participant in voiceParticipants"
          :key="`presence-${participant.sid}`"
          class="voice-presence-avatar"
          :class="{ speaking: voiceActiveSpeakers.includes(participant.sid) }"
          :style="{ '--voice-color': participant.color }"
          :title="participant.identity"
          @click="focusVoiceParticipant(participant)"
        >
          <img v-if="participant.avatar" :src="participant.avatar" alt="" />
          <span v-else>{{ participant.identity?.[0]?.toUpperCase() || "?" }}</span>
        </button>
      </div>
      <div v-if="selected?.kind === 'text'" class="messages">
        <section v-if="selected?.kind === 'text' && !displayedMessages.length" class="channel-empty-state">
          <span>#</span>
          <h2>Welcome to #{{ selected?.name }}</h2>
          <p>This is the beginning of the {{ selected?.name }} channel.</p>
        </section>
        <article
          v-for="message in displayedMessages"
          :key="message.id"
          :ref="(element) => setMessageElement(message.id, element)"
          :class="{ 'has-message-reply': repliedMessage(message) }"
          @contextmenu.stop="showUserMenu($event, message)"
        >
          <button
            v-if="repliedMessage(message)"
            class="message-reply-reference"
            type="button"
            :title="repliedMessage(message).body"
            @click="jumpToMessage(repliedMessage(message).id)"
          >
            <span class="message-reply-avatar">
              <img
                v-if="messageAuthor(repliedMessage(message))?.avatar_url"
                :src="messageAuthor(repliedMessage(message)).avatar_url"
                alt=""
              />
              <b v-else>{{ repliedMessage(message).author_name?.[0] || '?' }}</b>
            </span>
            <strong :style="usernameThemeStyle(messageAuthor(repliedMessage(message)))">{{ repliedMessage(message).author_name }} <span v-if="communityMemberTag.text" class="community-member-tag"><i>{{ communityMemberTag.emoji }}</i>{{ communityMemberTag.text }}</span></strong>
            <span>{{ repliedMessage(message).body || 'Attachment' }}</span>
          </button>
          <button
            class="message-avatar"
            @click="openProfile(message.author_id)"
          >
            <img
              v-if="messageAuthor(message)?.avatar_url"
              class="avatar image"
              :src="messageAuthor(message).avatar_url"
              alt=""
            />
            <span v-else class="avatar">{{ message.author_name[0] }}</span>
          </button>
          <div>
            <button
              class="message-username"
              :style="usernameThemeStyle(messageAuthor(message))"
              @click="openProfile(message.author_id)"
            >
              {{ message.author_name }} <span v-if="communityMemberTag.text" class="community-member-tag"><i>{{ communityMemberTag.emoji }}</i>{{ communityMemberTag.text }}</span></button
            ><time>{{
              new Date(message.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            }}</time>
            <p>
              <template
                v-for="(part, index) in messageSegments(message.body)"
                :key="index"
              >
                <img
                  v-if="part.type === 'emoji'"
                  class="message-custom-emoji"
                  :src="part.url"
                  :alt="`:${part.name}:`"
                  :title="`:${part.name}:`"
                />
                <time v-else-if="part.type === 'timestamp'" class="message-timestamp" :title="part.title">{{ part.value }}</time>
                <template v-else>{{ part.value }}</template>
              </template>
            </p>
            <div v-if="message.content_warning" class="message-warning">{{ message.content_warning }}</div>
            <div v-if="message.attachments?.length" class="message-attachments">
              <figure v-for="attachment in message.attachments" :key="attachment.id" class="message-attachment">
                <img :class="{ blurred: message.content_warning && !revealedAttachments[`${message.id}:${attachment.id}`] }" :src="apiEndpoint(attachment.url)" :alt="attachment.name" tabindex="0" role="button" @click="(!message.content_warning || revealedAttachments[`${message.id}:${attachment.id}`]) && openImageLightbox(attachment.url, attachment.name)" @keydown.enter="(!message.content_warning || revealedAttachments[`${message.id}:${attachment.id}`]) && openImageLightbox(attachment.url, attachment.name)" />
                <button v-if="message.content_warning" type="button" class="attachment-reveal" :title="revealedAttachments[`${message.id}:${attachment.id}`] ? 'Hide image' : 'Show image'" @click="toggleAttachment(message.id, attachment.id)"><FontAwesomeIcon :icon="revealedAttachments[`${message.id}:${attachment.id}`] ? faEyeSlash : faEye" /> {{ revealedAttachments[`${message.id}:${attachment.id}`] ? 'Hide image' : 'Show image' }}</button>
                <figcaption>{{ attachment.name }}</figcaption>
              </figure>
            </div>
            <div class="message-reactions">
              <button
                v-for="reaction in messageReactions[message.id] || []"
                :key="reaction"
                class="message-reaction-pill selected"
                type="button"
                :title="`Remove ${reaction} reaction`"
                @click="reactToMessage(message, reaction)"
              >
                <img v-if="reactionCustomEmoji(reaction)" :src="reactionCustomEmoji(reaction).url" :alt="reaction" />
                <span v-else>{{ reaction }}</span>
                <b>1</b>
              </button>
              <button
                class="message-add-reaction"
                type="button"
                title="Add reaction"
                aria-label="Add reaction"
                @click="openReactionPicker(message)"
              >+</button>
            </div>
            <div class="message-actions">
              <button type="button" @click="replyTo = message">↩ Reply</button>
            </div>
          </div>
        </article>
      </div>
      <div v-if="voiceRoom" id="voice-stage" class="voice-stage" :class="{ 'voice-floating': page !== 'chat' || selected?.id !== voiceRoom.__channelId, 'voice-stage-focused': focusedVoiceParticipant }" :style="voiceFloatingStyle" @pointerdown="startVoiceStageDrag">
        <button
          v-for="participant in visibleVoiceVisuals"
          :id="voiceTileId(participant)"
          :key="participant.sid"
          class="voice-participant-tile"
          :class="{
            speaking: voiceActiveSpeakers.includes(participant.participantSid || participant.sid),
            focused: focusedVoiceParticipant === participant.sid,
            'screen-share-tile': participant.isScreen,
            'screen-tile': participant.isScreen,
          }"
          :style="{ '--voice-color': participant.color }"
          @click="focusVoiceParticipant(participant)"
        >
          <span v-if="participant.banner && !participant.isScreen" class="voice-profile-banner" :style="{ backgroundImage: `url(${participant.banner})` }"></span>
          <img v-if="participant.avatar && !participant.isScreen" class="voice-profile-avatar" :src="participant.avatar" alt="" />
          <span v-else class="voice-placeholder">{{ participant.identity?.[0]?.toUpperCase() || "?" }}</span>
          <span v-if="participant.isScreen && !watchingScreens.includes(participant.participantSid)" class="screen-watch-control" @click.stop="watchScreen(participant)">▶ Watch screen</span>
          <span class="voice-name">{{ participant.isScreen ? `${participant.identity} · Screen` : `${participant.identity}${participant.local ? " (you)" : ""}` }}</span>
          <span v-if="!participant.isScreen" class="voice-activity" :class="{ active: voiceActiveSpeakers.includes(participant.participantSid || participant.sid) }" aria-label="Voice activity"><i></i><i></i><i></i><i></i></span>
        </button>
        <button v-if="!focusedVoiceParticipant && selected?.id === voiceRoom.__channelId" class="voice-invite-tile" type="button" @click="openGuildSettings('invites')">
          <span>＋</span><strong>Invite someone</strong><small>Share this room with friends</small>
        </button>
      </div>
      <div v-else-if="selected?.kind === 'voice'" class="voice-stage voice-lobby-stage">
        <div v-if="voiceConnecting" class="voice-participant-tile voice-connecting-tile" :style="{ '--voice-color': user?.accent_color || '#8b5cf6' }">
          <img v-if="user?.avatar_url" :src="user.avatar_url" alt="" />
          <span v-else class="voice-placeholder">{{ user?.display_name?.[0]?.toUpperCase() || '?' }}</span>
          <span class="voice-name">{{ user?.display_name || 'You' }} (you)</span>
          <span class="voice-connecting-state">{{ voiceStatus || 'Connecting…' }}</span>
        </div>
        <div v-else v-for="participant in channelPresence(selected)" :key="`lobby-${participant.identity}`" class="voice-participant-tile" :class="{ speaking: participant.speaking }" :style="{ '--voice-color': participant.color || '#8b5cf6' }">
          <span v-if="participant.banner" class="voice-profile-banner" :style="{ backgroundImage: `url(${participant.banner})` }"></span>
          <img v-if="participant.avatar" class="voice-profile-avatar" :src="participant.avatar" alt="" />
          <span v-else class="voice-placeholder">{{ participant.name?.[0]?.toUpperCase() || '?' }}</span>
          <span class="voice-name">{{ participant.name }} <span v-if="communityMemberTag.text" class="community-member-tag"><i>{{ communityMemberTag.emoji }}</i>{{ communityMemberTag.text }}</span></span>
          <span class="voice-activity" :class="{ active: participant.speaking }"><i></i><i></i><i></i><i></i></span>
        </div>
        <button v-if="!voiceConnecting" class="voice-invite-tile voice-join-tile" type="button" @click="joinVoice(selected)">
          <span>♪</span><strong>Join {{ selected.name }}</strong><small v-if="channelPresence(selected).length">Join the conversation</small><small v-else>No one is connected yet</small>
        </button>
      </div>
      <div v-if="voiceRoom && selected?.id === voiceRoom.__channelId" class="voice-bottom-toolbar">
        <button :title="micMuted ? 'Unmute' : 'Mute'" :aria-label="micMuted ? 'Unmute' : 'Mute'" :data-label="micMuted ? 'Unmute' : 'Mute'" @click="toggleMic"><FontAwesomeIcon :icon="micMuted ? faMicrophoneSlash : faMicrophone" /></button>
        <button :title="voiceRoom.localParticipant.isCameraEnabled ? 'Camera off' : 'Camera'" aria-label="Camera" data-label="Camera" @click="toggleCamera"><FontAwesomeIcon :icon="faCamera" /></button>
        <button title="Share screen" aria-label="Share screen" data-label="Share" @click="toggleScreenShare"><FontAwesomeIcon :icon="faDisplay" /></button>
        <button title="Firefox browser" aria-label="Firefox browser" data-label="Browser" @click="startSharedBrowser"><FontAwesomeIcon :icon="faDisplay" /></button>
        <button :title="voicePanelOpen ? 'Hide chat' : 'Side chat'" :aria-label="voicePanelOpen ? 'Hide chat' : 'Side chat'" data-label="Chat" @click="voicePanelOpen = !voicePanelOpen"><FontAwesomeIcon :icon="faComments" /></button>
        <button title="Network diagnostics" aria-label="Network diagnostics" data-label="Network" @click="networkPanelOpen = !networkPanelOpen; refreshNetworkStats()"><FontAwesomeIcon :icon="faChartSimple" /></button>
        <button class="hangup" title="Leave voice" aria-label="Leave voice" data-label="Disconnect" @click="leaveVoice"><FontAwesomeIcon :icon="faPhoneSlash" /></button>
      </div>
      <aside v-if="voiceRoom && networkPanelOpen" class="network-panel">
        <strong>Connection diagnostics</strong>
        <span class="network-quality">● {{ networkStats.quality }}</span>
        <dl><dt>Ping</dt><dd>{{ networkStats.ping }}</dd><dt>Bitrate</dt><dd>{{ networkStats.bitrate }}</dd><dt>Audio codec</dt><dd>{{ networkStats.codec }}</dd><dt>Jitter</dt><dd>{{ networkStats.jitter }}</dd><dt>Video FPS</dt><dd>{{ networkStats.fps }}</dd></dl>
      </aside>
      <div v-if="browserSession" class="shared-browser-panel">
        <header><strong>Shared Firefox</strong><button @click="closeSharedBrowser">×</button></header>
        <iframe :src="browserSession.url" title="Shared Firefox browser" allow="autoplay; fullscreen"></iframe>
      </div>
      <aside v-if="voiceRoom && voicePanelOpen" class="voice-side-chat">
        <header><div><strong>{{ voiceChatChannelName || 'Voice' }} chat</strong><small>Only for this voice channel</small></div><button @click="voicePanelOpen = false">×</button></header>
        <div class="voice-side-messages">
          <p v-if="!voiceMessages.length" class="voice-chat-empty">No messages yet. Start the voice chat.</p>
          <article v-for="message in voiceMessages" :key="`voice-${message.id}`">
            <strong>{{ message.author_name }} <span v-if="communityMemberTag.text" class="community-member-tag"><i>{{ communityMemberTag.emoji }}</i>{{ communityMemberTag.text }}</span></strong><p v-if="message.body">{{ message.body }}</p>
            <div v-if="message.attachments?.length" class="voice-message-attachments">
              <template v-for="attachment in message.attachments" :key="attachment.id">
                <button v-if="attachment.mimeType?.startsWith('image/')" type="button" class="voice-image-button" @click="openImageLightbox(attachment.url, attachment.name)"><img :src="apiEndpoint(attachment.url)" :alt="attachment.name" /></button>
                <a v-else class="voice-file-card" :href="apiEndpoint(attachment.url)" target="_blank" rel="noopener" download><span>↧</span><div><strong>{{ attachment.name || 'Download file' }}</strong><small>{{ attachment.mimeType || 'File' }}</small></div></a>
              </template>
            </div>
          </article>
        </div>
        <form class="voice-chat-composer" @submit.prevent="sendVoiceMessage">
          <div v-if="voicePendingAttachments.length" class="voice-upload-queue"><span v-for="(attachment, index) in voicePendingAttachments" :key="attachment.id">{{ attachment.name }}<button type="button" @click="voicePendingAttachments.splice(index, 1)">×</button></span></div>
          <label class="voice-upload-button" title="Upload a photo or file">＋<input type="file" @change="uploadVoiceAttachment" /></label>
          <input v-model="voiceDraft" maxlength="4000" :placeholder="`Message ${voiceChatChannelName || 'voice channel'}`" />
          <button type="submit" :disabled="!voiceDraft.trim() && !voicePendingAttachments.length">Send</button>
        </form>
      </aside>
      <aside v-if="emojiPickerOpen" class="emoji-picker">
        <header>
          <input v-model="emojiSearch" placeholder="Find the perfect emoji" />
          <button @click="closeEmojiPicker">×</button>
        </header>
        <div class="emoji-scroll">
          <section v-if="federatedGuildEmojis.length" class="emoji-category">
            <button
              class="emoji-category-heading"
              @click="toggleEmojiGroup('community')"
            >
              <span class="emoji-instance-icon">{{
                activeCommunity.name[0]?.toUpperCase()
              }}</span>
              {{ activeCommunity.name }}
              <b>{{ collapsedEmojiGroups.community ? "›" : "⌄" }}</b>
            </button>
            <div v-if="!collapsedEmojiGroups.community" class="emoji-grid">
              <button
                v-for="emoji in filteredCustomEmojis(federatedGuildEmojis)"
                :key="emoji.id"
                :title="`:${emoji.name}:`"
                @click="chooseEmoji(`:${emoji.name}:`)"
              >
                <img :src="emoji.url" :alt="emoji.name" />
              </button>
            </div>
          </section>
          <section v-if="customEmojis.length" class="emoji-category">
            <button
              class="emoji-category-heading"
              @click="toggleEmojiGroup('instance')"
            >
              <span class="emoji-instance-icon">{{
                instanceEmojiName[0]?.toUpperCase()
              }}</span>
              {{ instanceEmojiName }}
              <b>{{ collapsedEmojiGroups.instance ? "›" : "⌄" }}</b>
            </button>
            <div v-if="!collapsedEmojiGroups.instance" class="emoji-grid">
              <button
                v-for="emoji in filteredCustomEmojis()"
                :key="emoji.id"
                :title="`:${emoji.name}:`"
                @click="chooseEmoji(`:${emoji.name}:`)"
              >
                <img :src="emoji.url" :alt="emoji.name" />
              </button>
            </div>
          </section>
          <section
            v-for="group in defaultEmojiGroups"
            :key="group.name"
            class="emoji-category"
          >
            <button
              class="emoji-category-heading"
              @click="toggleEmojiGroup(group.name)"
            >
              <span>{{ group.icon }}</span
              >{{ group.name
              }}<b>{{ collapsedEmojiGroups[group.name] ? "›" : "⌄" }}</b>
            </button>
            <div v-if="!collapsedEmojiGroups[group.name]" class="emoji-grid">
              <button
                v-for="emoji in filteredDefaultEmojis(group)"
                :key="emoji"
                @click="chooseEmoji(emoji)"
              >
                {{ emoji }}
              </button>
            </div>
          </section>
        </div>
      </aside>
      <div v-if="replyTo" class="reply-banner">Replying to {{ replyTo.author_name }} <button type="button" @click="replyTo = null">×</button></div>
      <div v-if="composerMenuOpen" class="composer-menu">
        <label><FontAwesomeIcon :icon="faDisplay" /> Upload a file<input type="file" accept="image/png,image/jpeg,image/gif" @change="uploadMessageAttachment($event); composerMenuOpen = false" /></label>
      </div>
      <div v-if="selected?.kind === 'text' && Object.keys(typingUsers[selected.id] || {}).length" class="typing-indicator"><template v-if="Object.keys(typingUsers[selected.id]).length <= 3">{{ Object.values(typingUsers[selected.id]).join(', ') }} {{ Object.keys(typingUsers[selected.id]).length === 1 ? 'is' : 'are' }} typing</template><template v-else>Multiple people are typing</template></div>
      <form v-if="selected?.kind === 'text'" @submit.prevent="sendMessage">
        <button type="button" class="attachment-button" title="More message options" @click="composerMenuOpen = !composerMenuOpen">＋</button>
        <div v-if="pendingAttachments.length" class="attachment-previews"><span v-for="attachment in pendingAttachments" :key="attachment.id"><img :src="attachment.url" :alt="attachment.name" /><button type="button" :class="{ active: contentWarning }" @click="contentWarning = contentWarning ? '' : 'Content warning'">{{ contentWarning ? 'Content warning' : 'Mark as content warning' }}</button></span></div>
        <input
          v-model="draft"
          :placeholder="`Message #${selected?.name || 'channel'}`"
          maxlength="4000" @input="announceTyping"
        /><button
          type="button"
          class="emoji-trigger"
          title="Choose emoji"
          @click="toggleComposerEmojiPicker"
        >
          ☺</button
        ><button>Send</button>
      </form>
    </section>
    <div v-if="shareDialogOpen" class="dialog-layer" @click.self="shareDialogOpen = false">
      <section class="dialog-card share-dialog"><span class="label">VOICE & VIDEO</span><h2>Share your screen</h2><p>Choose how you want your screen to appear to everyone in the channel.</p>
        <label>Quality<select v-model="shareQuality"><option>720p</option><option>1080p</option><option>1440p</option><option>4K</option></select></label>
        <label>Frame rate<select v-model="shareFps"><option :value="15">15 FPS</option><option :value="30">30 FPS</option><option :value="60">60 FPS</option><option :value="120">120 FPS</option><option :value="144">144 FPS</option><option :value="145">145 FPS</option></select></label>
        <label class="check-row"><input v-model="shareAudio" type="checkbox" /> Include system audio</label>
        <div v-if="isDesktopApp && shareSources.length" class="share-source-picker">
          <nav class="share-source-tabs"><button type="button" :class="{ active: shareSourceTab === 'applications' }" @click="shareSourceTab = 'applications'">▣ Applications</button><button type="button" :class="{ active: shareSourceTab === 'screens' }" @click="shareSourceTab = 'screens'">▰ Entire Screen</button><button type="button" :class="{ active: shareSourceTab === 'devices' }" @click="shareSourceTab = 'devices'">◉ Devices</button></nav>
          <div v-if="shareSourceTab === 'devices'" class="share-devices-empty">Camera and other capture devices are managed in Voice &amp; Audio settings.</div>
          <button v-for="source in filteredShareSources" :key="source.id" type="button" class="share-source" :class="{ selected: selectedShareSource === source.id }" @click="selectedShareSource = source.id">
            <img :src="source.thumbnail" alt="" /><span>{{ source.name }}</span>
          </button>
        </div>
        <div><button @click="shareDialogOpen = false">Cancel</button><button class="primary" @click="startScreenShare">Choose a window</button></div>
      </section>
    </div>
    <section v-else-if="page === 'admin'" class="admin">
      <header>
        <div>
          <span class="eyebrow">INSTANCE SETTINGS</span>
          <h2>
            {{
              adminTab === "instance"
                ? "Home instance"
                : adminTab === "users"
                  ? "Users"
                  : adminTab === "moderation"
                    ? "Moderation"
                    : "Federation"
            }}
          </h2>
          <p>
            {{
              adminTab === "instance"
                ? "Configure public identity, registrations, limits, and moderation defaults."
                : adminTab === "users"
                  ? "Manage local accounts and administrator access."
                  : adminTab === "moderation"
                    ? "Review reports, active bans, and instance moderation history."
                    : "Choose which remote LibraCord instances this server trusts."
            }}
          </p>
        </div>
      </header>
      <div class="admin-body">
        <div v-if="error" class="error">{{ error }}</div>
        <form
          v-if="adminTab === 'instance'"
          class="instance-form"
          @submit.prevent="saveInstance"
        >
          <label
            >Instance name<input
              v-model="instanceForm.name"
              required
              maxlength="80"
          /></label>
          <label
            >Short description<input
              v-model="instanceForm.shortDescription"
              maxlength="160"
          /></label>
          <label
            >Full description<textarea
              v-model="instanceForm.description"
              rows="5"
              maxlength="4000"
            ></textarea>
          </label>
          <label
            >Contact email<input
              v-model="instanceForm.contactEmail"
              type="email"
          /></label>
          <label
            >Registration mode<select v-model="instanceForm.registrations">
              <option value="open">Open</option>
              <option value="approval">Approval required</option>
              <option value="invite">Invite only</option>
              <option value="closed">Closed</option>
            </select></label
          >
          <label
            >Federation mode<select v-model="instanceForm.federationMode">
              <option value="open">Open</option>
              <option value="allowlist">Allowlist</option>
              <option value="closed">Closed</option>
            </select></label
          >
          <label
            >Upload limit (MB)<input
              v-model.number="instanceForm.maxUploadMb"
              type="number"
              min="1"
              max="100"
          /></label>
          <label
            >Message retention days <small>(0 keeps forever)</small
            ><input
              v-model.number="instanceForm.retentionDays"
              type="number"
              min="0"
              max="3650"
          /></label>
          <label
            >Accent color<input v-model="instanceForm.accentColor" type="color"
          /></label>
          <label
            >Rules <small>(one per line)</small
            ><textarea
              :value="(instanceForm.rules || []).join('\n')"
              @input="instanceForm.rules = $event.target.value.split('\n')"
              rows="7"
            ></textarea>
          </label>
          <section v-if="user.role === 'owner'" class="instance-emoji-admin">
            <h3>Instance Emoji</h3>
            <p>
              Upload PNG, JPG, or animated GIF emoji for everyone on this
              instance.
            </p>
            <div class="emoji-upload-row">
              <input
                v-model="emojiName"
                placeholder="emoji_name"
                maxlength="32"
              />
              <label class="upload-button">
                Choose image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif"
                  @change="emojiFile = $event.target.files?.[0] || null"
                />
              </label>
              <button type="button" class="primary" @click="uploadEmoji">
                Upload Emoji
              </button>
            </div>
            <div class="emoji-admin-grid">
              <article v-for="emoji in customEmojis" :key="emoji.id">
                <img :src="emoji.url" :alt="emoji.name" />
                <span>:{{ emoji.name }}:</span>
                <button
                  type="button"
                  class="danger"
                  @click="removeEmoji(emoji)"
                >
                  Remove
                </button>
              </article>
            </div>
          </section>
          <button class="primary">Save instance settings</button>
        </form>
        <div v-else-if="adminTab === 'users'" class="admin-users">
          <article v-for="member in adminUsers" :key="member.id">
            <div>
              <strong>{{ member.display_name }}</strong
              ><small
                >{{ member.username }}@{{ user.home_server }} ·
                {{ member.email }}</small
              >
            </div>
            <select v-model="member.role" :disabled="member.role === 'owner'">
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="member">Member</option></select
            ><label
              ><input
                v-model="member.suspended"
                type="checkbox"
                :disabled="member.role === 'owner'"
              />
              Suspended</label
            ><button
              @click="saveAdminUser(member)"
              :disabled="member.role === 'owner'"
            >
              Save
            </button>
            <div v-if="member.role !== 'owner'" class="admin-user-moderation">
              <input v-model="member.moderationReason" maxlength="1000" placeholder="Reason for instance ban" />
              <button class="danger" @click="banAdminUser(member)">Ban from instance</button>
              <textarea v-model="member.systemMessage" maxlength="12000" rows="2" placeholder="Message from the instance system account"></textarea>
              <button @click="sendAdminSystemMessage(member)">Send system DM</button>
            </div>
          </article>
        </div>
        <div v-else-if="adminTab === 'moderation'" class="moderation-dashboard">
          <section>
            <h3>Active instance bans</h3>
            <article v-for="ban in adminModeration.bans" :key="ban.user_id">
              <div><strong>{{ ban.display_name }}</strong><small>@{{ ban.username }} · {{ ban.reason }}</small></div>
              <time>{{ new Date(ban.created_at).toLocaleString() }}</time>
              <button @click="unbanAdminUser(ban)">Unban</button>
            </article>
            <p v-if="!adminModeration.bans.length" class="empty">No active instance bans.</p>
          </section>
          <section>
            <h3>User reports</h3>
            <article v-for="report in adminModeration.reports" :key="report.id">
              <div><strong>{{ report.category }} · {{ report.target_type }}</strong><small>{{ report.reporter_name }} reported {{ report.target_id }}</small><p>{{ report.description }}</p></div>
              <select v-model="report.status" @change="updateModerationReport(report, report.status)"><option value="open">Open</option><option value="reviewing">Reviewing</option><option value="actioned">Actioned</option><option value="dismissed">Dismissed</option></select>
            </article>
            <p v-if="!adminModeration.reports.length" class="empty">No reports waiting for review.</p>
          </section>
          <section>
            <h3>Moderation history</h3>
            <article v-for="action in adminModeration.actions" :key="action.id">
              <div><strong>{{ action.action.replaceAll('_', ' ') }}</strong><small>{{ action.moderator_name || 'System' }} · {{ action.target_name || action.target_user_id || 'Report' }}</small><p v-if="action.reason">{{ action.reason }}</p></div>
              <time>{{ new Date(action.created_at).toLocaleString() }}</time>
            </article>
          </section>
        </div>
        <template v-else>
          <form class="peer-form" @submit.prevent="addPeer">
            <input
              v-model="peerForm.name"
              placeholder="Instance name"
              maxlength="80"
              required
            /><input
              v-model="peerForm.baseUrl"
              type="url"
              placeholder="https://community.example"
              required
            /><select v-model="peerForm.status">
              <option value="pending">Pending</option>
              <option value="allowed">Allowed</option>
              <option value="blocked">Blocked</option></select
            ><button class="primary">Add instance</button>
          </form>
          <div class="peer-list">
            <article v-for="peer in peers" :key="peer.id">
              <div>
                <input v-model="peer.name" class="peer-name" /><input
                  v-model="peer.base_url"
                  class="peer-url"
                />
              </div>
              <select v-model="peer.status" :class="`status ${peer.status}`">
                <option value="pending">Pending</option>
                <option value="allowed">Allowed</option>
                <option value="blocked">Blocked</option></select
              ><button @click="checkPeer(peer)" :disabled="peer.checking">{{ peer.checking ? 'Checking…' : 'Test' }}</button
              ><button @click="savePeer(peer)">Save</button
              ><button class="danger" @click="removePeer(peer)">Remove</button>
              <small v-if="peer.health">{{ peer.health }}</small>
            </article>
            <p v-if="!peers.length" class="empty">
              No remote instances configured yet.
            </p>
          </div>
          <aside class="notice">
            <strong>Federation protocol status</strong>
            <p>
              Allowed instances exchange signed, replay-safe federation events.
              Review local reports here and use peer policies to restrict abusive
              remote instances.
            </p>
          </aside>
        </template>
      </div>
    </section>
    <section v-else-if="page === 'home'" class="home-hub">
      <header v-if="homeTab !== 'dm'" class="home-hero">
        <span>LIBRA HOME</span>
        <h2>
          {{
            homeTab === "feed"
              ? "Pulse"
              : homeTab === "discover"
                ? "Find your people"
                : "Creative exchange"
          }}
        </h2>
        <p>
          A shared space for statuses, communities, and identity across your
          connected federation.
        </p>
        <div class="federation-summary">
          <span>{{ homeSources.length }} connected instances</span>
          <span v-if="unavailableHomeSources"
            >{{ unavailableHomeSources }} temporarily unavailable</span
          >
        </div>
      </header>
      <div v-if="homeTab === 'dm'" class="dm-page"><aside class="dm-sidebar"><input placeholder="Find or start a conversation" /><h3>Direct Messages</h3><button v-for="friend in openDmUsers" :key="friend.id" class="dm-contact" :class="{ active: dmTarget?.id === friend.id }" @click="openDm(friend)"><span class="avatar"><img v-if="friend.avatar_url" :src="friend.avatar_url" alt="" />{{ !friend.avatar_url ? friend.display_name[0] : '' }}</span><strong>{{ friend.display_name }} <b v-if="friend.system" class="system-badge">SYSTEM</b></strong><small>{{ friend.status_text || (friend.system ? 'Official instance messages' : 'Online') }}</small></button></aside><section class="dm-conversation"><header><span class="avatar"><img v-if="dmTarget?.avatar_url" :src="dmTarget.avatar_url" alt="" />{{ !dmTarget?.avatar_url ? (dmTarget?.display_name?.[0] || 'D') : '' }}</span><div><h2>{{ dmTarget?.display_name || 'Direct messages' }} <b v-if="dmTarget?.system" class="system-badge">SYSTEM</b></h2><small>{{ dmTarget ? dmTarget.username : 'Choose a friend to start chatting' }}</small></div><div v-if="dmTarget && !dmTarget.system" class="dm-call-actions"><button type="button" title="Voice call" @click="startDmCall('audio')"><FontAwesomeIcon :icon="faPhoneSlash" /></button><button type="button" title="Video call" @click="startDmCall('video')"><FontAwesomeIcon :icon="faCamera" /></button><button type="button" title="Screen share" @click="startDmCall('screen')"><FontAwesomeIcon :icon="faDisplay" /></button></div></header><div class="dm-messages"><template v-if="dmTarget"><article v-for="message in dmMessages" :key="message.id" :class="{ 'system-message': message.kind === 'system' }"><img v-if="message.avatar_url" class="avatar image" :src="message.avatar_url" alt="" /><span v-else class="avatar">{{ message.author_name?.[0] }}</span><div><strong>{{ message.author_name }} <b v-if="message.kind === 'system'" class="system-badge">SYSTEM</b></strong><p>{{ message.body }}</p><small>{{ new Date(message.created_at).toLocaleString() }}</small></div></article><p v-if="!dmMessages.length" class="empty">Start a conversation.</p></template><p v-else class="empty">Select a conversation from the left.</p></div><form v-if="dmTarget && !dmTarget.system" class="dm-composer" @submit.prevent="sendDm"><input v-model="dmDraft" :placeholder="`Message ${dmTarget.display_name || ''}`" maxlength="4000" /><button class="primary">Send</button></form><div v-else-if="dmTarget?.system" class="dm-system-notice">Official instance messages are read-only.</div></section></div>
      <div v-else-if="homeTab === 'friends'" class="home-feed friends-page"><span class="eyebrow">HOME · FRIENDS</span><h2>Friends</h2><form class="friend-add" @submit.prevent="addFriend"><input v-model="friendUsername" placeholder="Add by username" /><button class="primary">Add friend</button></form><section v-if="friendRequests.length"><h3>Requests</h3><article v-for="request in friendRequests" :key="request.id"><strong>{{ request.display_name }}</strong><button class="primary" @click="acceptFriend(request)">Accept</button></article></section><h3>Your friends</h3><article v-for="friend in friends" :key="friend.id" class="friend-row"><span class="avatar"><img v-if="friend.avatar_url" :src="friend.avatar_url" alt="" />{{ !friend.avatar_url ? friend.display_name[0] : '' }}</span><div><strong>{{ friend.display_name }}</strong><small>{{ friend.username }}</small><p>{{ friend.status_text || 'Online' }}</p></div><button class="friend-message" title="Message" @click="openDm(friend)"><FontAwesomeIcon :icon="faComments" /></button><button @click="removeFriendEntry(friend)">Remove</button></article><p v-if="!friends.length" class="empty">No friends yet.</p></div>
      <div v-else-if="homeTab === 'feed'" class="home-feed">
        <form class="status-composer" @submit.prevent="publishStatus">
          <div>
            <span class="avatar">{{ user.display_name[0] }}</span
            ><textarea
              v-model="homePostDraft"
              maxlength="1000"
              placeholder="Share something with your home instance…"
            ></textarea>
          </div>
          <footer>
            <small>{{ homePostDraft.length }}/1000</small
            ><button class="primary">Publish pulse</button>
          </footer>
        </form>
        <article v-for="post in homePosts" :key="post.id" class="pulse-card">
          <button
            class="message-avatar"
            @click="!post.source?.peer_id && openProfile(post.author_id)"
          >
            <img v-if="post.avatar_url" :src="post.avatar_url" alt="" /><span
              v-else
              class="avatar"
              >{{ post.display_name[0] }}</span
            >
          </button>
          <div>
            <header>
              <button
                @click="!post.source?.peer_id && openProfile(post.author_id)"
              >
                {{ post.display_name }}</button
              ><span
                >@{{ post.username }}@{{
                  post.source?.domain || user.home_server
                }}
                · {{ new Date(post.created_at).toLocaleString() }}</span
              >
            </header>
            <p>{{ post.body }}</p>
            <footer>
              <button disabled title="Pulse replies are not available yet">Reply</button
              ><button disabled title="Pulse boosts are not available yet">Boost</button
              ><button disabled title="Pulse reactions are not available yet">React</button>
            </footer>
          </div>
        </article>
        <p v-if="!homePosts.length" class="empty">
          The pulse is quiet. Publish the first status.
        </p>
      </div>
      <div v-else-if="homeTab === 'discover'" class="discovery-grid">
        <article
          v-for="guild in discoverCommunities"
          :key="guild.id"
          :style="atmosphereStyle(guild.profile?.atmosphere)"
        >
          <span>{{ guild.name[0] }}</span>
          <h3>{{ guild.name }}</h3>
          <p>{{ guild.description }}</p>
          <button
            v-if="!guild.remote && communities.some((entry) => entry.id === guild.id)"
            @click="chooseGuild(guild)"
          >Open community</button>
          <button v-else-if="guild.remote" :disabled="guild.membership_status === 'pending' || guild.membership_status === 'joined'" @click="joinRemoteCommunity(guild)">
            {{ guild.membership_status === 'joined' ? 'Joined' : guild.membership_status === 'pending' ? 'Request sent' : `Join ${guild.address || 'community'}` }}
          </button>
          <button v-else disabled>Invite required</button>
        </article>
      </div>
      <div v-else class="creative-market">
        <form class="publish-card" @submit.prevent="publishCreation">
          <span>PUBLISH YOUR WORK</span>
          <h3>
            {{
              homeTab === "themes"
                ? "App theme"
                : homeTab === "decorations"
                  ? "User decoration"
                  : homeTab === "usernames"
                    ? "Username style & font"
                  : "Profile theme"
            }}
          </h3>
          <input
            v-model="publishForm.name"
            maxlength="80"
            placeholder="Creation name"
            required
          /><textarea
            v-model="publishForm.description"
            maxlength="500"
            rows="3"
            placeholder="Tell people about it"
          ></textarea>
          <label
          v-if="homeTab === 'decorations' || homeTab === 'profiles' || homeTab === 'usernames'"
            class="creation-image-upload"
          >
            Optional PNG, JPG, or animated GIF
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif"
              @change="publishImageFile = $event.target.files?.[0] || null"
            /> </label
          ><button class="primary">Publish</button>
        </form>
        <div class="creation-grid">
          <article
            v-for="item in publishedItemsForTab()"
            :key="item.id"
          >
            <div
              class="creation-swatch"
              :class="[
                `decoration-${item.payload.frame || 'standard'}`,
                { 'decoration-preview': item.kind === 'decoration' },
              ]"
              :style="publishedPreviewStyle(item)"
            >
              <span v-if="item.kind === 'decoration'">{{
                item.payload.icon || "✦"
              }}</span>
            </div>
            <span>{{ item.kind.replace("-", " ") }}</span>
            <h3>{{ item.name }}</h3>
            <p>{{ item.description || "Published by the community." }}</p>
            <small
              >by {{ item.display_name }}@{{
                item.source?.domain || user.home_server
              }}</small
            ><button v-if="!isCollected(item)" @click="addToCollection(item)">
              Add to collection
            </button>
            <button v-else @click="removeFromCollection(item)">
              Remove from collection
            </button>
          </article>
        </div>
      </div>
    </section>
    <aside v-if="page === 'chat'" class="member-list">
      <div class="member-list-heading"><strong>Members — {{ guildMembers.length }}</strong><button type="button" title="Close member list" aria-label="Close member list" @click="membersPanelOpen = false">×</button></div>
      <label class="member-search"><span class="sr-only">Search members</span><input v-model="memberSearch" placeholder="Search members" /></label>
      <template v-for="(member, memberIndex) in displayedGuildMembers" :key="member.id"><div v-if="isFirstRoleMember(member, memberIndex, displayedGuildMembers)" class="member-role-heading">{{ primaryMemberRole(member)?.name || 'Online' }} — {{ displayedGuildMembers.filter((item) => (primaryMemberRole(item)?.id || '__online') === (primaryMemberRole(member)?.id || '__online')).length }}</div><button
        class="themed-member"
        :class="{ 'has-member-theme': member.banner_url }"
        :style="{
          '--member-accent': member.accent_color,
          '--member-banner': member.banner_url
            ? `url(${member.banner_url})`
            : member.accent_color,
        }"
        @click="openProfile(member.id)"
        @contextmenu.stop="showUserMenu($event, member)"
      >
        <span class="member-avatar-wrap">
          <img v-if="member.avatar_url" :src="member.avatar_url" alt="" /><span
            v-else
            class="avatar"
            >{{ member.display_name[0] }}</span
          >
          <i :class="`presence-${member.presence_status || 'online'}`"></i>
          <span
            v-if="profileDecoration(member)"
            class="mini-profile-decoration"
            :style="publishedPreviewStyle(profileDecoration(member))"
            ><img
              v-if="profileDecoration(member).payload.imageUrl"
              :src="profileDecoration(member).payload.imageUrl"
              alt=""
            /><b v-else>{{
              profileDecoration(member).payload.icon || "✦"
            }}</b></span
          >
        </span>
        <div>
          <strong :style="usernameThemeStyle(member)">{{ member.nickname || member.display_name }} <span v-if="communityMemberTag.text" class="community-member-tag"><i>{{ communityMemberTag.emoji }}</i>{{ communityMemberTag.text }}</span></strong>
          <span v-if="member.roles?.length" class="member-role-chips"><i v-for="role in member.roles" :key="role.id" :style="{ color: role.color }">{{ role.name }}</i></span>
          <small>{{
            member.status_text || `${member.username}@${user.home_server}`
          }}</small>
        </div>
      </button></template>
    </aside>
    <div
      v-if="channelMenu"
      class="context-dismiss"
      @click="channelMenu = null"
      @contextmenu.prevent="channelMenu = null"
    ></div>
    <menu
      v-if="channelMenu"
      class="context-menu channel-context-menu"
      :style="{ left: `${channelMenu.x}px`, top: `${channelMenu.y}px` }"
      @contextmenu.stop.prevent
    >
      <button @click="channelMenu = null">Mark as Read</button>
      <div class="context-separator"></div>
      <button @click="copyChannelValue('link')">Invite to Channel</button>
      <button @click="pinChannel">Pin Channel to Top</button>
      <button @click="copyChannelValue('link')">Copy Link</button>
      <div class="context-separator"></div>
      <button @click="toggleChannelMute">
        {{
          settings.mutedChannels?.includes(channelMenu.channel.id)
            ? "Unmute"
            : "Mute"
        }}
        Channel
      </button>
      <button @click="openChannelSettings(channelMenu.channel, 'permissions')">
        Notification Settings <span>›</span>
      </button>
      <div class="context-separator"></div>
      <button @click="openChannelSettings(channelMenu.channel)">
        Edit Channel
      </button>
      <button @click="duplicateChannel">Duplicate Channel</button>
      <button
        @click="
          openGuildSettings('channels');
          channelMenu = null;
        "
      >
        Create
        {{ channelMenu.channel.kind === "voice" ? "Voice" : "Text" }} Channel
      </button>
      <button class="danger" @click="removeChannel">Delete Channel</button>
      <div class="context-separator"></div>
      <button @click="copyChannelValue('id')">Copy Channel ID</button>
    </menu>
    <div
      v-if="userMenu"
      class="context-dismiss"
      @pointerdown="userMenu = null"
      @contextmenu.stop.prevent="userMenu = null"
    ></div>
    <menu
      v-if="userMenu"
      class="context-menu user-context-menu"
      :style="{ left: `${userMenu.x}px`, top: `${userMenu.y}px` }"
      @contextmenu.stop.prevent
    >
      <button @click="openProfile(userMenu.id)">Profile</button>
      <button @click="openDm({ id: userMenu.id, display_name: userMenu.name })">Message</button>
      <button @click="mentionUser">Mention</button>
      <div class="context-separator"></div>
      <button @click="openProfile(userMenu.id, 'full')">
        Edit Per-server Profile
      </button>
      <button disabled title="App integrations are not available yet">Apps <span>›</span></button>
      <button
        @click="
          openGuildSettings('roles');
          userMenu = null;
        "
      >
        Roles <span>›</span>
      </button>
      <div v-if="guildRoles.length" class="context-role-list"><small>Assign role</small><button v-for="role in guildRoles.filter((item) => !item.managed)" :key="`assign-${role.id}`" @click="toggleMemberRole(role)"><i :style="{ background: role.color }"></i>{{ role.name }}</button></div>
      <div class="context-separator"></div>
      <button v-if="userMenu.id !== user.id" @click="reportUserFromMenu">Report user</button>
      <button
        @click="
          openGuildSettings('members');
          userMenu = null;
        "
      >
        Open in Mod View
      </button>
      <div class="context-separator"></div>
      <button @click="copyUserId">Copy User ID</button>
    </menu>
    <div
      v-if="appMenu"
      class="context-dismiss"
      @pointerdown="appMenu = null"
      @contextmenu.stop.prevent="appMenu = null"
    ></div>
    <menu
      v-if="appMenu"
      class="context-menu app-context-menu"
      :style="{ left: `${appMenu.x}px`, top: `${appMenu.y}px` }"
      @contextmenu.stop.prevent
    >
      <button
        v-if="appMenu.hasSelection || appMenu.editable"
        @click="runAppMenuAction('copy')"
      >
        Copy
      </button>
      <button v-if="appMenu.editable" @click="runAppMenuAction('paste')">
        Paste
      </button>
      <button @click="runAppMenuAction('select')">Select all</button>
      <div class="context-separator"></div>
      <button @click="runAppMenuAction('settings')">User settings</button>
    </menu>
    <div
      v-if="invitePreview"
      class="dialog-layer invite-layer"
      @click.self="closeInvitePreview"
    >
      <article class="dialog-card invite-join-card">
        <span class="invite-mark">{{ invitePreview.guild_name?.[0] }}</span>
        <span class="label">YOU'RE INVITED TO</span>
        <h2>{{ invitePreview.guild_name }}</h2>
        <p>{{ invitePreview.guild_description || "A community on LibraCord" }}</p>
        <small>{{ invitePreview.member_count }} members</small>
        <div>
          <button @click="closeInvitePreview">Not now</button>
          <button class="primary" @click="joinFromInvite">Join community</button>
        </div>
      </article>
    </div>
    <div
      v-if="guildDialog"
      class="dialog-layer"
      @click.self="guildDialog = false"
    >
      <form class="dialog-card" @submit.prevent="createGuild">
        <h2>Create a server</h2>
        <p>
          Servers are independent communities hosted on {{ user.home_server }}.
        </p>
        <label
          >Name<input v-model="newGuild.name" maxlength="80" required /></label
        ><label
          >Description<textarea
            v-model="newGuild.description"
            maxlength="500"
            rows="4"
          ></textarea>
        </label>
        <div>
          <button type="button" @click="guildDialog = false">Cancel</button
          ><button class="primary">Create server</button>
        </div>
      </form>
    </div>
    <div
      v-if="channelSettingsOpen"
      class="settings-overlay channel-settings-overlay"
    >
      <aside class="settings-nav channel-settings-nav">
        <h3>
          # {{ channelSettingsForm.name }}
          {{
            channelSettingsForm.kind === "text"
              ? "TEXT CHANNEL"
              : "VOICE CHANNEL"
          }}
        </h3>
        <button
          :class="{ selected: channelSettingsTab === 'overview' }"
          @click="channelSettingsTab = 'overview'"
        >
          Overview
        </button>
        <button
          :class="{ selected: channelSettingsTab === 'permissions' }"
          @click="channelSettingsTab = 'permissions'"
        >
          Permissions
        </button>
        <button
          :class="{ selected: channelSettingsTab === 'invites' }"
          @click="channelSettingsTab = 'invites'"
        >
          Invites
        </button>
        <button
          :class="{ selected: channelSettingsTab === 'integrations' }"
          @click="channelSettingsTab = 'integrations'"
        >
          Integrations
        </button>
        <div class="channel-nav-separator"></div>
        <button class="delete-server-nav" @click="deleteEditedChannel">
          Delete Channel
        </button>
      </aside>
      <section class="settings-content channel-settings-content">
        <button class="close-settings" @click="channelSettingsOpen = false">
          ×
        </button>
        <div v-if="error" class="error">{{ error }}</div>
        <div v-if="saved" class="success">{{ saved }}</div>
        <template v-if="channelSettingsTab === 'overview'">
          <h2>Overview</h2>
          <label>
            Channel Name
            <input v-model="channelSettingsForm.name" maxlength="80" />
          </label>
          <label>
            Category
            <select v-model="channelSettingsForm.categoryId">
              <option :value="null">No category</option>
              <option v-for="category in guildCategories" :key="category.id" :value="category.id">{{ category.name }}</option>
            </select>
          </label>
          <label v-if="channelSettingsForm.kind === 'text'">
            Channel Topic
            <textarea
              v-model="channelSettingsForm.topic"
              maxlength="1024"
              rows="8"
              placeholder="Let everyone know how to use this channel!"
            ></textarea>
            <small class="channel-character-count">
              {{ (channelSettingsForm.topic || "").length }}/1024
            </small>
          </label>
          <template v-if="channelSettingsForm.kind === 'voice'">
            <label>Audio codec<select v-model="channelSettingsForm.voiceCodec"><option v-for="codec in supportedVoiceCodecs" :key="codec.value" :value="codec.value">{{ codec.label }}</option></select><small>Only codecs supported by this browser are shown.</small></label>
            <label>Audio bitrate<select v-model.number="channelSettingsForm.voiceBitrate"><option v-for="rate in [24000,32000,48000,64000,96000,128000,192000,256000,320000]" :key="rate" :value="rate">{{ rate / 1000 }} kbps</option></select></label>
            <label>Sample rate<select v-model.number="channelSettingsForm.voiceSampleRate"><option v-for="rate in [8000,16000,24000,32000,44100,48000]" :key="rate" :value="rate">{{ rate / 1000 }} kHz</option></select><small>WebRTC audio capture rates supported by modern browsers.</small></label>
          </template>
          <label>
            Slowmode
            <select v-model.number="channelSettingsForm.slowmodeSeconds">
              <option :value="0">Off</option>
              <option :value="5">5 seconds</option>
              <option :value="10">10 seconds</option>
              <option :value="30">30 seconds</option>
              <option :value="60">1 minute</option>
              <option :value="300">5 minutes</option>
              <option :value="3600">1 hour</option>
            </select>
            <small>Members can send one message during each interval.</small>
          </label>
          <fieldset class="channel-visibility">
            <legend>Content Visibility</legend>
            <label
              ><input
                v-model="channelSettingsForm.contentVisibility"
                type="radio"
                value="default"
              /><span
                ><strong>Default</strong
                ><small>Channel content is always visible.</small></span
              ></label
            >
            <label
              ><input
                v-model="channelSettingsForm.contentVisibility"
                type="radio"
                value="spoiler"
              /><span
                ><strong>Spoiler Channel</strong
                ><small
                  >Content stays hidden until a member chooses to view
                  it.</small
                ></span
              ></label
            >
            <label
              ><input
                v-model="channelSettingsForm.contentVisibility"
                type="radio"
                value="age-restricted"
              /><span
                ><strong>Age-Restricted Channel</strong
                ><small
                  >Members must confirm they are over the legal age.</small
                ></span
              ></label
            >
          </fieldset>
          <label class="channel-switch-row browser-safety-row">
            <span><strong>NSFW channel</strong><small>Allow the shared browser policy to open adult websites in this channel.</small></span>
            <input v-model="channelSettingsForm.nsfw" type="checkbox" />
          </label>
          <label class="channel-switch-row">
            <span
              ><strong>Announcement Channel</strong
              ><small
                >Allow members to follow published posts from this
                channel.</small
              ></span
            >
            <input v-model="channelSettingsForm.announcement" type="checkbox" />
          </label>
          <button class="primary" @click="saveChannelSettings">
            Save Changes
          </button>
        </template>
        <template v-else-if="channelSettingsTab === 'permissions'">
          <h2>Channel Permissions</h2>
          <p class="channel-help">Use permissions to customise who can do what in this channel.</p>
          <div class="permission-sync-card">↻ <span>Permissions synced with category</span></div>
          <label class="permission-private-row"><span><strong>🔒 Private Channel</strong><small>Only selected members and roles will be able to view this channel.</small></span><input type="checkbox" :checked="permissionState(channelPermissionRules[0]) === 'deny'" @change="cyclePermission(channelPermissionRules[0])" /></label>
          <div class="advanced-permissions-heading"><h3>Advanced permissions</h3><span>⌄</span></div>
          <div class="permission-editor">
            <aside class="permission-targets"><small>ROLES/MEMBERS</small><button v-for="role in guildRoles" :key="role.id" :class="{ selected: channelPermissionTarget === role.id }" @click="channelPermissionTarget = role.id"><i :style="{ background: role.color }"></i>{{ role.name }}</button></aside>
            <section class="permission-rules"><h3>General Channel Permissions</h3><article v-for="rule in channelPermissionRules" :key="rule.name" class="permission-rule"><div><strong>{{ rule.name }}</strong><p>{{ rule.description }}</p></div><button class="permission-cycle" :class="permissionState(rule)" @click="cyclePermission(rule)" :title="`State: ${permissionState(rule)}`"><span>×</span><b>/</b><em>✓</em></button></article></section>
          </div>
        </template>
        <template v-else-if="channelSettingsTab === 'invites'">
          <h2>Invites</h2>
          <div class="resource-list">
            <article v-for="invite in guildInvites" :key="invite.id">
              <code>{{ inviteUrl(invite) }}</code
              ><span>{{ invite.uses }} uses</span
              ><button @click="copyInvite(invite)">Copy link</button>
            </article>
          </div>
        </template>
        <template v-else>
          <h2>Integrations</h2>
          <div class="resource-list">
            <article
              v-for="hook in guildWebhooks.filter(
                (item) => item.channel_id === channelSettingsForm.id,
              )"
              :key="hook.id"
            >
              <strong>{{ hook.name }}</strong
              ><small>Webhook</small>
            </article>
            <p
              v-if="
                !guildWebhooks.some(
                  (item) => item.channel_id === channelSettingsForm.id,
                )
              "
              class="empty"
            >
              No integrations are connected to this channel.
            </p>
          </div>
        </template>
      </section>
    </div>
    <div
      v-if="guildSettingsDialog"
      class="settings-overlay guild-settings-overlay instance-style-settings"
    >
      <aside class="settings-nav">
        <h3>{{ activeCommunity.name }}</h3>
        <p class="settings-nav-description">{{ activeCommunity.description || 'Community settings and administration' }}</p>
        <span class="settings-group">Community settings</span>
        <button
          :class="{ selected: guildSettingsTab === 'overview' }"
          @click="guildSettingsTab = 'overview'"
        >
          Server Profile</button
        ><button
          :class="{ selected: guildSettingsTab === 'appearance' }"
          @click="guildSettingsTab = 'appearance'"
        >
          Atmosphere</button
        ><button
          :class="{ selected: guildSettingsTab === 'channels' }"
          @click="guildSettingsTab = 'channels'"
        >
          Channels
        </button>
        <span class="settings-group">People</span
        ><button
          :class="{ selected: guildSettingsTab === 'roles' }"
          @click="guildSettingsTab = 'roles'"
        >
          Roles</button
        ><button
          :class="{ selected: guildSettingsTab === 'members' }"
          @click="guildSettingsTab = 'members'"
        >
          Members</button
        ><button
          :class="{ selected: guildSettingsTab === 'invites' }"
          @click="guildSettingsTab = 'invites'"
        >
          Invites
        </button>
        <span class="settings-group">Apps</span
        ><button
          :class="{ selected: guildSettingsTab === 'webhooks' }"
          @click="guildSettingsTab = 'webhooks'"
        >
          Webhooks</button
        ><span class="settings-group">Expression</span>
        <button
          :class="{ selected: guildSettingsTab === 'emoji' }"
          @click="guildSettingsTab = 'emoji'"
        >
          Emoji
        </button>
        <span class="settings-group">Moderation</span
        ><button
          :class="{ selected: guildSettingsTab === 'safety' }"
          @click="guildSettingsTab = 'safety'"
        >
          Safety Setup</button
        ><button
          :class="{ selected: guildSettingsTab === 'audit' }"
          @click="guildSettingsTab = 'audit'"
        >
          Audit Log</button
        ><button disabled title="Community ban management is not available yet">Bans</button><span class="settings-group">Community</span
        ><button @click="guildSettingsTab = 'overview'">
          Community Overview</button
        ><button
          :class="{ selected: guildSettingsTab === 'onboarding' }"
          @click="guildSettingsTab = 'onboarding'"
        >
          Onboarding</button
        ><button disabled title="Server insights are not available yet">Server Insights</button
        ><button class="delete-server-nav" disabled title="Server deletion is not available yet">Delete Server</button>
        <button class="settings-back-link" @click="guildSettingsDialog = false">← Back to chat</button>
      </aside>
      <section class="settings-content community-content">
        <button class="close-settings" @click="guildSettingsDialog = false">
          ×
        </button>
        <header class="settings-workspace-header"><span class="eyebrow">COMMUNITY SETTINGS</span><h2>{{ communitySettingsPage[0] }}</h2><p>{{ communitySettingsPage[1] }}</p></header>
        <div class="settings-workspace-body">
        <div v-if="error" class="error">{{ error }}</div>
        <div v-if="saved" class="success">{{ saved }}</div>
        <template v-if="guildSettingsTab === 'overview'">
          <div class="server-profile-heading">
            <div>
              <h2>Server Profile</h2>
              <p>
                Customize how your community appears across LibraCord and
                federation.
              </p>
            </div>
          </div>
          <div class="server-profile-layout">
            <div class="server-profile-editor">
              <label
                >Name<input v-model="guildForm.name" maxlength="80"
              /></label>
              <div class="community-tag-fields">
                <label>Member tag<input v-model="guildForm.profile.memberTag" maxlength="12" placeholder="AURORA" /></label>
                <label>Tag emoji<input v-model="guildForm.profile.memberTagEmoji" maxlength="16" placeholder="🌌" /></label>
              </div>
              <p class="upload-help">This community badge appears beside member usernames throughout LibraCord.</p>
              <div class="profile-divider">
                <h3>Icon</h3>
                <p>We recommend a square image of at least 512×512.</p>
                <label class="upload-button">Upload server icon<input type="file" accept="image/png,image/jpeg,image/gif" @change="openImageCrop('community-icon', $event)" /></label>
                <button v-if="guildForm.iconUrl" class="secondary" type="button" @click="guildForm.iconUrl = ''">Remove preview</button>
              </div>
              <div class="profile-divider">
                <h3>Banner</h3>
                <label class="upload-button">Upload server banner<input type="file" accept="image/png,image/jpeg,image/gif" @change="openImageCrop('community-banner', $event)" /></label>
                <div class="banner-swatches">
                  <button
                    v-for="color in [
                      '#f5e7f4',
                      '#f72585',
                      '#ef2b2d',
                      '#f58220',
                      '#f6d738',
                      '#8e44ad',
                      '#16a9ee',
                      '#58dfd1',
                      '#477d0b',
                      '#292929',
                    ]"
                    :key="color"
                    :class="{
                      selected: guildForm.profile.bannerColor === color,
                    }"
                    :style="{ background: color }"
                    @click="guildForm.profile.bannerColor = color"
                  ></button>
                </div>
              </div>
              <div class="profile-divider">
                <h3>Traits</h3>
                <p>Add up to five traits that describe your community.</p>
                <div class="trait-grid">
                  <input
                    v-for="(_, index) in guildForm.profile.traits"
                    :key="index"
                    v-model="guildForm.profile.traits[index]"
                    maxlength="30"
                    placeholder="Add a trait"
                  />
                </div>
              </div>
              <div class="profile-divider">
                <label
                  >Description<textarea
                    v-model="guildForm.description"
                    maxlength="500"
                    rows="6"
                  ></textarea>
                </label>
              </div>
              <button class="primary" @click="saveGuild">Save changes</button>
            </div>
            <aside class="server-card-preview">
              <div
                class="server-card-banner"
                :style="{ background: guildForm.bannerUrl ? `url(${guildForm.bannerUrl}) center / cover` : guildForm.profile.bannerColor }"
              ></div>
              <div class="server-card-icon" :style="guildForm.iconUrl ? { backgroundImage: `url(${guildForm.iconUrl})`, backgroundSize: 'cover', color: 'transparent' } : {}">
                {{ guildForm.name?.[0]?.toUpperCase() || "L" }}
              </div>
              <strong>{{ guildForm.name || "Community" }}</strong>
              <p><i></i> {{ guildMembers.length }} Members</p>
              <small>{{
                guildForm.description || "Your community description"
              }}</small>
              <div class="server-card-traits">
                <span
                  v-for="trait in guildForm.profile.traits.filter(Boolean)"
                  :key="trait"
                  >{{ trait }}</span
                >
              </div>
            </aside>
          </div>
        </template>
        <template v-else-if="guildSettingsTab === 'appearance'">
          <h2>Community Atmosphere</h2>
          <p>
            Give this community its own visual world. The atmosphere follows
            members throughout the app.
          </p>
          <div
            class="atmosphere-preview"
            :style="atmosphereStyle(guildForm.profile.atmosphere)"
          >
            <span>{{ activeCommunity.name }}</span>
          </div>
          <label
            >Background style<select
              v-model="guildForm.profile.atmosphere.mode"
            >
              <option value="gradient">Gradient</option>
              <option value="solid">Solid colour</option>
              <option value="image">Image with gradient veil</option>
            </select></label
          >
          <div class="atmosphere-colors">
            <label
              >First colour<input
                v-model="guildForm.profile.atmosphere.start"
                type="color" /></label
            ><label
              >Second colour<input
                v-model="guildForm.profile.atmosphere.end"
                type="color"
            /></label>
          </div>
          <label
            >Gradient direction
            <output>{{ guildForm.profile.atmosphere.angle }}°</output
            ><input
              v-model.number="guildForm.profile.atmosphere.angle"
              type="range"
              min="0"
              max="360"
          /></label>
          <label
            >Panel glass
            <output>{{ guildForm.profile.atmosphere.glass }}%</output
            ><input
              v-model.number="guildForm.profile.atmosphere.glass"
              type="range"
              min="35"
              max="95"
          /></label>
          <div class="community-background-upload">
            <label class="upload-button"
              >Choose background<input
                type="file"
                accept="image/png,image/jpeg,image/gif"
                @change="
                  communityBackgroundFile = $event.target.files?.[0] || null
                " /></label
            ><button class="primary" @click="uploadCommunityBackground">
              Upload Background
            </button>
          </div>
          <button class="primary" @click="saveGuild">Save Atmosphere</button>
        </template>
        <template v-else-if="guildSettingsTab === 'channels'"
          ><h2>Channels & Categories</h2>
          <div class="settings-create">
            <input
              v-model="channelForm.name"
              placeholder="new-channel"
            /><select v-model="channelForm.kind">
              <option value="text">Text</option>
              <option value="voice">Voice</option></select
            ><button class="primary" @click="addChannel">Create channel</button>
          </div>
          <div class="resource-list">
            <article
              v-for="channel in activeCommunity.channels"
              :key="channel.id"
              draggable="true"
              @dragstart="draggedChannelId = channel.id"
              @dragover.prevent
              @drop="moveChannel(activeCommunity.channels.find((item) => item.id === draggedChannelId), channel); draggedChannelId = null"
            >
              <strong
                >{{ channel.kind === "text" ? "#" : "Voice" }}
                {{ channel.name }}</strong
              ><button
                @click="channelMenu = { channel, x: innerWidth / 2, y: 180 }"
              >
                Manage
              </button>
            </article>
          </div>
          <h3>Categories</h3>
          <div class="settings-create">
            <input v-model="categoryName" placeholder="Category name" /><button
              class="primary"
              @click="addCategory"
            >
              Create category
            </button>
          </div>
          <div class="resource-list">
            <article class="category-drop-target" @dragover.prevent @drop="moveChannelToCategory(activeCommunity.channels.find((item) => item.id === draggedChannelId), null); draggedChannelId = null">
              <strong>Uncategorized</strong><small>Drop a channel here</small>
            </article>
            <article v-for="category in guildCategories" :key="category.id" class="category-drop-target" @dragover.prevent @drop="moveChannelToCategory(activeCommunity.channels.find((item) => item.id === draggedChannelId), category.id); draggedChannelId = null">
              <strong>{{ category.name }}</strong><button @click="renameCategory(category)">Rename</button><button class="danger" @click="removeCategory(category)">Delete</button>
            </article>
          </div></template
        >
        <template v-else-if="guildSettingsTab === 'roles'">
          <div class="role-workspace">
            <aside class="role-list-panel">
              <header>
                <strong>BACK</strong><button @click="addRole">+</button>
              </header>
              <button
                v-for="role in guildRoles"
                :key="role.id"
                :class="{ selected: selectedRole?.id === role.id }"
                @click="editRole(role)"
              >
                <i :style="{ background: role.color }"></i>{{ role.name }}
              </button>
            </aside>
            <section v-if="selectedRole" class="role-editor">
              <header>
                <h2>EDIT ROLE — {{ selectedRole.name.toUpperCase() }}</h2>
                <button
                  class="primary"
                  :disabled="selectedRole.managed"
                  @click="saveRole"
                >
                  Save
                </button>
              </header>
              <nav>
                <button
                  :class="{ selected: roleEditorTab === 'display' }"
                  @click="roleEditorTab = 'display'"
                >
                  Display</button
                ><button
                  :class="{ selected: roleEditorTab === 'permissions' }"
                  @click="roleEditorTab = 'permissions'"
                >
                  Permissions</button
                ><button
                  :class="{ selected: roleEditorTab === 'links' }"
                  @click="roleEditorTab = 'links'"
                >
                  Links</button
                ><button
                  :class="{ selected: roleEditorTab === 'members' }"
                  @click="roleEditorTab = 'members'"
                >
                  Manage Members ({{ selectedRole ? membersWithRole(selectedRole.id).length : 0 }})
                </button>
              </nav>
              <p v-if="selectedRole.managed" class="managed-role-note">
                The default role is managed automatically. Create another role
                to customize its appearance and permissions.
              </p>
              <div v-if="roleEditorTab === 'display'" class="role-tab">
                <h3>Role Style</h3>
                <div class="role-styles">
                  <button
                    v-for="style in ['solid', 'gradient', 'holographic']"
                    :key="style"
                    :class="{ selected: selectedRole.style === style }"
                    @click="selectedRole.style = style"
                  >
                    {{ style }}
                  </button>
                </div>
                <h3>Role colour</h3>
                <div class="role-colors">
                  <button
                    v-for="color in [
                      '#99aab5',
                      '#1abc9c',
                      '#2ecc71',
                      '#3498db',
                      '#9b59b6',
                      '#e91e63',
                      '#f1c40f',
                      '#e67e22',
                      '#e74c3c',
                      '#95a5a6',
                      '#607d8b',
                      '#ffb6c1',
                      '#ffd6a5',
                      '#fdffb6',
                      '#caffbf',
                      '#9bf6ff',
                      '#a0c4ff',
                      '#bdb2ff',
                      '#ffc6ff',
                      '#ff9ec1',
                    ]"
                    :key="color"
                    :style="{ background: color }"
                    :class="{ selected: selectedRole.color === color }"
                    @click="selectedRole.color = color"
                  ></button>
                </div>
                <label
                  >Role name<input v-model="selectedRole.name" maxlength="80"
                /></label>
                <div class="role-message-preview">
                  <p :style="{ color: selectedRole.color }">
                    <strong>{{ user.display_name }}</strong> <small>20:45</small
                    ><br />rocks are really old
                  </p>
                  <p>
                    <strong>{{ user.display_name }}</strong> <small>20:45</small
                    ><br />rocks are really old
                  </p>
                  <p class="light">
                    <strong>{{ user.display_name }}</strong> <small>20:45</small
                    ><br />rocks are really old
                  </p>
                </div>
                <label class="role-toggle"
                  >Display role members separately
                  <input v-model="selectedRole.hoist" type="checkbox" /></label
                ><label class="role-toggle"
                  >Allow anyone to @mention this role
                  <input v-model="selectedRole.mentionable" type="checkbox"
                /></label>
              </div>
              <div v-else-if="roleEditorTab === 'permissions'" class="role-tab">
                <input
                  v-model="permissionSearch"
                  class="permission-search"
                  placeholder="Search permissions"
                />
                <h3>General Server Permissions</h3>
                <article
                  v-for="choice in permissionChoices.filter((item) =>
                    item[0]
                      .toLowerCase()
                      .includes(permissionSearch.toLowerCase()),
                  )"
                  :key="choice[1]"
                  class="permission-row"
                >
                  <div>
                    <strong>{{ choice[0] }}</strong>
                    <p>
                      Controls whether members with this role can
                      {{ choice[0].toLowerCase() }}.
                    </p>
                  </div>
                  <button
                    class="switch"
                    :class="{ on: roleHasPermission(choice[1]) }"
                    @click="toggleRolePermission(choice[1])"
                  >
                    <i></i>
                  </button>
                </article>
              </div>
              <div v-else-if="roleEditorTab === 'members'" class="role-tab">
                <h3>Manage Members</h3>
                <div class="resource-list">
                  <article v-for="member in membersWithRole(selectedRole.id)" :key="member.id">
                    <strong>{{ member.display_name }}</strong
                    ><small>{{ member.username }}@{{ user.home_server }}</small>
                  </article>
                </div>
              </div>
              <div v-else class="role-tab">
                <h3>Role Links</h3>
                <p>Connect this role to integrations and federated groups.</p>
              </div>
            </section>
            <div v-else class="role-empty">
              <h2>Roles</h2>
              <p>Select a role or create a new one.</p>
            </div>
          </div>
        </template>
        <template v-else-if="guildSettingsTab === 'members'"
          ><h2>Members</h2>
          <div class="resource-list">
            <article v-for="member in guildMembers" :key="member.id">
              <strong>{{ member.nickname || member.display_name }}</strong
              ><small>{{ member.username }}@{{ user.home_server }}</small
              ><button
                v-if="member.id !== activeCommunity.owner_id"
                class="danger-text"
                @click="removeCommunityMember(member)"
              >Remove</button>
            </article>
          </div></template
        >
        <template v-else-if="guildSettingsTab === 'invites'"
          ><h2>Invites</h2>
          <div class="settings-create">
            <input
              v-model.number="inviteForm.maxUses"
              type="number"
              min="0"
              placeholder="Maximum uses"
            /><button class="primary" @click="addInvite">Create invite</button>
          </div>
          <div class="resource-list">
            <article v-for="invite in guildInvites" :key="invite.id">
              <code>{{ inviteUrl(invite) }}</code
              ><span
                >{{ invite.uses }} / {{ invite.max_uses || "∞" }} uses</span
              ><button @click="copyInvite(invite)">Copy link</button>
            </article>
          </div></template
        >
        <template v-else-if="guildSettingsTab === 'emoji'">
          <h2>Emoji</h2>
          <p>
            Upload custom emoji for {{ activeCommunity.name }}. PNG, JPG, and
            animated GIF are supported.
          </p>
          <div class="emoji-upload-row community-emoji-upload">
            <input
              v-model="guildEmojiName"
              placeholder="emoji_name"
              maxlength="32"
            />
            <label class="upload-button"
              >Choose image<input
                type="file"
                accept="image/png,image/jpeg,image/gif"
                @change="guildEmojiFile = $event.target.files?.[0] || null"
            /></label>
            <button class="primary" @click="uploadGuildEmoji">
              Upload Emoji
            </button>
          </div>
          <div class="emoji-admin-grid">
            <article v-for="emoji in guildEmojis" :key="emoji.id">
              <img :src="emoji.url" :alt="emoji.name" /><span
                >:{{ emoji.name }}:</span
              ><button class="danger" @click="removeGuildEmoji(emoji)">
                Remove
              </button>
            </article>
            <p v-if="!guildEmojis.length" class="empty">
              This community has no custom emoji yet.
            </p>
          </div>
        </template>
        <template v-else-if="guildSettingsTab === 'safety'">
          <h2>Safety Setup</h2>
          <p>Configure the default protections for this community.</p>
          <label class="channel-switch-row"
            ><span
              ><strong>Media content filter</strong
              ><small
                >Scan uploaded media and hide potentially unsafe content.</small
              ></span
            ><input
              v-model="guildForm.profile.safety.mediaFilter"
              type="checkbox"
          /></label>
          <label class="channel-switch-row"
            ><span
              ><strong>Require verified email</strong
              ><small
                >Members must verify their home-instance email before
                participating.</small
              ></span
            ><input
              v-model="guildForm.profile.safety.requireVerifiedEmail"
              type="checkbox"
          /></label>
          <label class="channel-switch-row"
            ><span
              ><strong>Block mention spam</strong
              ><small
                >Restrict messages containing excessive user mentions.</small
              ></span
            ><input
              v-model="guildForm.profile.safety.blockMentionSpam"
              type="checkbox"
          /></label>
          <button class="primary" @click="saveGuild">
            Save Safety Settings
          </button>
        </template>
        <template v-else-if="guildSettingsTab === 'onboarding'">
          <h2>Onboarding</h2>
          <label class="channel-switch-row"
            ><span
              ><strong>Enable onboarding</strong
              ><small>Welcome new members when they join.</small></span
            ><input
              v-model="guildForm.profile.onboarding.enabled"
              type="checkbox"
          /></label>
          <label
            >Welcome message<textarea
              v-model="guildForm.profile.onboarding.welcome"
              maxlength="500"
              rows="5"
              placeholder="Welcome to our community!"
            ></textarea>
          </label>
          <label
            >Default channel<select
              v-model="guildForm.profile.onboarding.defaultChannelId"
            >
              <option value="">No default</option>
              <option
                v-for="channel in activeCommunity.channels.filter(
                  (item) => item.kind === 'text',
                )"
                :key="channel.id"
                :value="channel.id"
              >
                # {{ channel.name }}
              </option>
            </select></label
          >
          <button class="primary" @click="saveGuild">Save Onboarding</button>
        </template>
        <template v-else-if="guildSettingsTab === 'audit'">
          <h2>Recent Activity</h2>
          <div class="resource-list">
            <article v-for="emoji in guildEmojis" :key="`emoji-${emoji.id}`">
              <strong>Emoji :{{ emoji.name }}: added</strong
              ><small>{{ new Date(emoji.created_at).toLocaleString() }}</small>
            </article>
            <article
              v-for="invite in guildInvites"
              :key="`invite-${invite.id}`"
            >
              <strong>Invite {{ invite.code }} created</strong
              ><small>{{ new Date(invite.created_at).toLocaleString() }}</small>
            </article>
            <p v-if="!guildEmojis.length && !guildInvites.length" class="empty">
              No recent activity.
            </p>
          </div>
        </template>
        <template v-else-if="guildSettingsTab === 'webhooks'"
          ><h2>Webhooks</h2>
          <div class="settings-create">
            <input
              v-model="webhookForm.name"
              placeholder="Webhook name"
            /><select v-model="webhookForm.channelId">
              <option value="">Choose channel</option>
              <option
                v-for="channel in activeCommunity.channels.filter(
                  (c) => c.kind === 'text',
                )"
                :key="channel.id"
                :value="channel.id"
              >
                # {{ channel.name }}
              </option></select
            ><button class="primary" @click="addWebhook">Create webhook</button>
          </div>
          <div class="resource-list">
            <article v-for="webhook in guildWebhooks" :key="webhook.id">
              <strong>{{ webhook.name }}</strong
              ><code>{{ webhook.id }}</code>
            </article>
          </div></template
        >
        <template v-else
          ><h2>Community Settings</h2>
          <p>Select a settings page from the sidebar.</p></template
        >
        </div>
      </section>
    </div>
    <div
      v-if="activeProfile"
      class="profile-popout-layer"
      :class="`profile-mode-${activeProfileMode}`"
      @click.self="activeProfile = null"
    >
      <article
        class="profile-card social-profile-card"
        :style="[
          { '--profile-accent': activeProfile.accent_color },
          profileThemeStyle(activeProfile),
          activeProfile.profile_css,
        ]"
      >
        <button
          class="profile-card-close"
          title="Close profile"
          @click="activeProfile = null"
        >
          &times;
        </button>
        <div
          class="profile-banner"
          :style="
                    profileBannerStyle(activeProfile)
          "
        ></div>
        <div class="profile-card-body">
          <img
            v-if="activeProfile.avatar_url"
            class="profile-card-avatar"
            :src="activeProfile.avatar_url"
            alt=""
          />
          <span v-else class="profile-card-avatar fallback">{{
            activeProfile.display_name[0]
          }}</span>
          <span
            v-if="profileDecoration(activeProfile)"
            class="selected-profile-decoration"
            :class="{ 'image-decoration': profileDecoration(activeProfile).payload.imageUrl }"
            :style="publishedPreviewStyle(profileDecoration(activeProfile))"
          >
            <img
              v-if="profileDecoration(activeProfile).payload.imageUrl"
              :src="profileDecoration(activeProfile).payload.imageUrl"
              alt=""
            />
            <b v-else>{{
              profileDecoration(activeProfile).payload.icon || "✦"
            }}</b>
          </span>
          <span class="profile-online-dot"></span>
          <div class="profile-status-bubble">
            {{
              activeProfile.status_text ||
              activeProfile.bio ||
              "Living my best federated life!"
            }}
          </div>
          <h3>{{ activeProfile.display_name }} <span v-if="communityMemberTag.text" class="community-member-tag"><i>{{ communityMemberTag.emoji }}</i>{{ communityMemberTag.text }}</span></h3>
          <div class="profile-handle">{{ activeProfile.handle }}<template v-if="activeProfile.pronouns"> · {{ activeProfile.pronouns }}</template></div>
          <div class="profile-sparkles">🦈 💠 🦄 💎 #️⃣ 🎁</div>
          <div v-if="activeProfileMode !== 'self'" class="profile-actions">
            <button @click="openDm({ id: activeProfile.id, display_name: activeProfile.display_name, username: activeProfile.username, avatar_url: activeProfile.avatar_url, banner_url: activeProfile.banner_url, status_text: activeProfile.status_text }); activeProfile = null">💬 Message</button>
            <button disabled title="Gifts are not available yet">🎁</button><button disabled title="More profile actions are not available yet">•••</button>
          </div>
          <div class="profile-section profile-about">
            <strong>About me</strong>
            <p>
              {{ activeProfile.bio || "This user hasn't added a bio yet." }}
            </p>
            <button
              v-if="activeProfileMode === 'compact'"
              class="profile-text-action"
              @click="activeProfileMode = 'full'"
            >
              View Full Bio
            </button>
          </div>
          <div v-if="activeProfileMode === 'self'" class="self-profile-menu">
            <button
              @click="
                activeProfile = null;
                openSettings();
              "
            >
              <span>✎ Edit Profile</span><b>NEW</b>
            </button>
            <button @click="editStatus">
              <span
                ><i :class="`presence-${activeProfile.status}`"></i
                >{{ activeProfile.status || "online" }}</span
              ><b>›</b>
            </button>
            <button disabled title="Clips are not available yet"><span>🎞 Clips</span><b>›</b></button>
            <button disabled title="Account switching is not available yet"><span>● Switch Accounts</span><b>›</b></button>
            <button @click="copyOwnProfileId">
              <span>▣ Copy User ID</span>
            </button>
          </div>
          <div v-if="activeProfileMode !== 'self'" class="profile-section">
            <strong>Member since</strong>
            <p>
              {{
                new Date(activeProfile.created_at).toLocaleDateString(
                  undefined,
                  { year: "numeric", month: "long", day: "numeric" },
                )
              }}
            </p>
          </div>
          <div v-if="activeProfileMode !== 'self'" class="profile-section">
            <strong>Roles</strong>
            <div class="profile-roles">
              <span
                v-for="role in activeProfile.roles?.length
                  ? activeProfile.roles
                  : [
                      {
                        name: activeProfile.role,
                        color: activeProfile.accent_color,
                      },
                    ]"
                :key="role.name"
                class="role-badge"
              >
                <i :style="{ background: role.color }"></i>{{ role.name }}
              </span>
              <button disabled title="Assign roles from the member context menu">＋</button>
            </div>
          </div>
          <button
            v-if="activeProfile.id === user.id && activeProfileMode !== 'self'"
            class="profile-edit-button"
            @click="
              activeProfile = null;
              openSettings();
            "
          >
            ✎ Edit Profile
          </button>
        </div>
      </article>
    </div>
    <div
      v-if="statusEditorOpen"
      class="dialog-layer status-dialog-layer"
      @click.self="statusEditorOpen = false"
    >
      <form class="dialog-card status-dialog" @submit.prevent="saveStatus">
        <h2>Set your status</h2>
        <label>
          Presence
          <select v-model="statusDraft.status">
            <option value="online">Online</option>
            <option value="idle">Idle</option>
            <option value="dnd">Do Not Disturb</option>
            <option value="offline">Invisible</option>
          </select>
        </label>
        <label>
          Custom status
          <input
            v-model="statusDraft.text"
            maxlength="128"
            placeholder="What are you up to?"
          />
        </label>
        <div>
          <button type="button" @click="statusEditorOpen = false">
            Cancel
          </button>
          <button class="primary">Save Status</button>
        </div>
      </form>
    </div>
    <div v-if="settingsOpen" class="settings-overlay user-settings-overlay instance-style-settings">
      <aside class="settings-nav">
        <h3>{{ activeCommunity?.name || 'LibraCord' }}</h3>
        <p class="settings-nav-description">{{ activeCommunity?.description || 'Your LibraCord account' }}</p>
        <span class="settings-group">User settings</span>
        <button
          :class="{ selected: settingsTab === 'profile' }"
          @click="settingsTab = 'profile'"
        >
          My Profile</button
        ><button
          :class="{ selected: settingsTab === 'password' }"
          @click="settingsTab = 'password'"
        >Password</button>
        <span class="settings-group">App settings</span><button
          :class="{ selected: settingsTab === 'audio' }"
          @click="settingsTab = 'audio'"
        >
          Voice & Audio</button
        ><button
          :class="{ selected: settingsTab === 'appearance' }"
          @click="settingsTab = 'appearance'"
        >
          Appearance</button
        ><button
          :class="{ selected: settingsTab === 'accessibility' }"
          @click="settingsTab = 'accessibility'"
        >Accessibility</button
        ><button
          :class="{ selected: settingsTab === 'notifications' }"
          @click="settingsTab = 'notifications'"
        >
          Notifications</button>
        <span class="settings-group">Privacy &amp; locale</span><button
          :class="{ selected: settingsTab === 'privacy' }"
          @click="settingsTab = 'privacy'"
        >Privacy &amp; Safety</button
        ><button
          :class="{ selected: settingsTab === 'language' }"
          @click="settingsTab = 'language'"
        >Language</button>
        <span v-if="isDesktopApp" class="settings-group">Desktop</span><button
          v-if="isDesktopApp"
          :class="{ selected: settingsTab === 'desktop' }"
          @click="settingsTab = 'desktop'"
        >
          Desktop app</button>
        <span class="settings-group">Advanced</span><button
          :class="{ selected: settingsTab === 'advanced' }"
          @click="settingsTab = 'advanced'"
        >Advanced</button
        ><template v-if="isAdmin"
          ><span class="settings-group">Administration</span
          ><button
            class="instance-settings-link"
            @click="settingsOpen = false; openAdmin('instance')"
          >
            <FontAwesomeIcon :icon="faSliders" /> Instance administration
          </button></template
        ><button class="settings-back-link" @click="settingsOpen = false">← Back to chat</button><button class="logout-link" @click="logout">Log Out</button>
      </aside>
      <section class="settings-content">
        <button
          class="close-settings"
          title="Close"
          @click="settingsOpen = false"
        >
          ×
        </button>
        <header class="settings-workspace-header"><span class="eyebrow">USER SETTINGS</span><h2>{{ userSettingsPage[0] }}</h2><p>{{ userSettingsPage[1] }}</p></header>
        <div class="settings-workspace-body">
        <div v-if="error" class="error">{{ error }}</div>
        <div v-if="saved" class="success">{{ saved }}</div>
        <template v-if="settingsTab === 'profile'">
          <h2>My Profile</h2>
          <div class="profile-studio">
            <div class="profile-fields">
              <label
                >Username<input
                  v-model="profileUsername"
                  maxlength="32"
                  pattern="[a-z0-9][a-z0-9_.-]{2,31}"
              /></label>
              <label
                >Display name<input v-model="profileName" maxlength="64"
              /></label>
              <div class="image-upload-row">
                <label class="upload-button"
                  >Upload avatar<input
                    type="file"
                    accept="image/png,image/jpeg,image/gif"
                    @change="openImageCrop('avatar', $event)"
                /></label>
                <label class="upload-button"
                  >Upload banner<input
                    type="file"
                    accept="image/png,image/jpeg,image/gif"
                    @change="openImageCrop('banner', $event)"
                /></label>
              </div>
              <small class="upload-help"
                >PNG, JPG, or animated GIF · maximum 32 MB</small
              >
              <label
                >Bio<textarea
                  v-model="profileBio"
                  maxlength="500"
                  rows="5"
                  placeholder="Tell people about yourself"
                ></textarea
                ><small class="character-count"
                  >{{ profileBio.length }}/500</small
                ></label
              >
              <label
                >Accent color<input v-model="profileAccent" type="color"
              /></label>
              <label
                >Custom CSS declarations<textarea
                  v-model="profileCss"
                  maxlength="2000"
                  rows="6"
                  placeholder="color: #ffffff; border-radius: 20px;"
                ></textarea
                ><small class="upload-help"
                  >Applied only to your profile card body. Selectors, imports,
                  and URLs are blocked.</small
                ></label
              >
              <section class="profile-cosmetics">
                <h3>Profile theme</h3>
                <div class="cosmetic-grid">
                  <button
                    :class="{ selected: !settings.selectedProfileThemeId }"
                    @click="settings.selectedProfileThemeId = ''"
                  >
                    Default
                  </button>
                  <button
                    v-for="item in publishedItems.filter(
                      (entry) =>
                        entry.kind === 'profile-theme' && isCollected(entry),
                    )"
                    :key="item.id"
                    :class="{
                      selected: settings.selectedProfileThemeId === item.id,
                    }"
                    :style="publishedPreviewStyle(item)"
                    @click="settings.selectedProfileThemeId = item.id"
                  >
                    {{ item.name }}
                  </button>
                </div>
                <h3>Username styles &amp; fonts</h3>
                <p class="upload-help">Stack multiple collected styles; they appear everywhere your name is shown.</p>
                <div class="cosmetic-grid username-style-options">
                  <button v-for="item in publishedItems.filter((entry) => entry.kind === 'decoration' && entry.payload.usernameEffect && isCollected(entry))" :key="`username-${item.id}`" :class="{ selected: settings.selectedUsernameStyleIds.includes(item.id) }" :style="publishedPreviewStyle(item)" @click="settings.selectedUsernameStyleIds = settings.selectedUsernameStyleIds.includes(item.id) ? settings.selectedUsernameStyleIds.filter((id) => id !== item.id) : [...settings.selectedUsernameStyleIds, item.id]">{{ item.name }}</button>
                </div>
                <h3>User decoration</h3>
                <div class="cosmetic-grid decoration-options">
                  <button
                    :class="{ selected: !settings.selectedDecorationId }"
                    @click="settings.selectedDecorationId = ''"
                  >
                    None
                  </button>
                  <button
                    v-for="item in publishedItems.filter(
                      (entry) =>
                        entry.kind === 'decoration' && isCollected(entry),
                    )"
                    :key="item.id"
                    :class="{
                      selected: settings.selectedDecorationId === item.id,
                    }"
                    :style="publishedPreviewStyle(item)"
                    @click="settings.selectedDecorationId = item.id"
                  >
                    <img
                      v-if="item.payload.imageUrl"
                      :src="item.payload.imageUrl"
                      alt=""
                    /><span v-else>{{ item.payload.icon || "✦" }}</span
                    ><small>{{ item.name }}</small>
                  </button>
                </div>
                <p
                  v-if="!publishedItems.some((item) => isCollected(item) && (item.kind === 'profile-theme' || item.kind === 'decoration'))"
                  class="empty cosmetic-empty"
                >
                  Your collection is empty. Add profile cosmetics from Libra Home first.
                </p>
                <div class="cosmetic-collection-manager">
                  <article
                    v-for="item in publishedItems.filter((entry) => isCollected(entry) && (entry.kind === 'profile-theme' || entry.kind === 'decoration'))"
                    :key="`owned-${item.id}`"
                  >
                    <span>{{ item.name }}</span>
                    <button @click="removeFromCollection(item)">Remove</button>
                  </article>
                </div>
              </section>
              <button class="primary" @click="saveSettings">
                Save profile
              </button>
            </div>
            <div class="profile-live-preview">
              <span class="label">LIVE PREVIEW</span>
              <article
                class="profile-card preview-card"
                :style="[
                  { '--profile-accent': profileAccent },
                  profileThemeStyle(),
                  profileCss,
                ]"
              >
                <div
                  class="profile-banner"
                  :style="
                    profileBanner
                      ? { backgroundImage: `url(${profileBanner})` }
                      : profileBannerStyle({ accent_color: profileAccent })
                  "
                ></div>
                <div class="profile-card-body">
                  <img
                    v-if="profileAvatar"
                    class="profile-card-avatar"
                    :src="profileAvatar"
                    alt="Profile preview"
                  />
                  <span v-else class="profile-card-avatar fallback">{{
                    profileName[0] || "?"
                  }}</span>
                  <span
                    v-if="profileDecoration()"
                    class="selected-profile-decoration"
                    :class="{ 'image-decoration': profileDecoration().payload.imageUrl }"
                    :style="publishedPreviewStyle(profileDecoration())"
                    ><img
                      v-if="profileDecoration().payload.imageUrl"
                      :src="profileDecoration().payload.imageUrl"
                      alt=""
                    /><b v-else>{{
                      profileDecoration().payload.icon || "✦"
                    }}</b></span
                  >
                  <h3>{{ profileName || "Display name" }} <span v-if="communityMemberTag.text" class="community-member-tag"><i>{{ communityMemberTag.emoji }}</i>{{ communityMemberTag.text }}</span></h3>
                  <div class="profile-handle">
                    {{ profileUsername || "username" }}@{{ user.home_server }}
                  </div>
                  <p>{{ profileBio || "Your bio will appear here." }}</p>
                </div>
              </article>
            </div>
          </div> </template
        ><template v-else-if="settingsTab === 'audio'"
          ><h2>Voice & Audio</h2>
          <label
            >Input device<select v-model="settings.inputDeviceId">
              <option value="">System default</option>
              <option
                v-for="device in audioDevices.inputs"
                :key="device.deviceId"
                :value="device.deviceId"
              >
                {{ device.label || "Microphone" }}
              </option>
            </select></label
          ><label
            >Input volume <output>{{ settings.inputVolume }}%</output
            ><input
              v-model.number="settings.inputVolume"
              type="range"
              min="0"
              max="100" /></label
          ><label
            >Output device<select v-model="settings.outputDeviceId">
              <option value="">System default</option>
              <option
                v-for="device in audioDevices.outputs"
                :key="device.deviceId"
                :value="device.deviceId"
              >
                {{ device.label || "Speakers" }}
              </option>
            </select></label
          ><label
            >Output volume <output>{{ settings.outputVolume }}%</output
            ><input
              v-model.number="settings.outputVolume"
              type="range"
              min="0"
              max="100" /></label
          ><label>Webcam<select v-model="settings.cameraDeviceId">
              <option value="">System default</option>
              <option v-for="device in videoDevices" :key="device.deviceId" :value="device.deviceId">{{ device.label || "Camera" }}</option>
            </select></label>
          <label>Webcam quality<select v-model="settings.cameraQuality"><option>720p</option><option>1080p</option><option>1440p</option><option>4K</option></select></label>
          <label>Webcam frame rate<select v-model.number="settings.cameraFps"><option :value="30">30 FPS</option><option :value="60">60 FPS</option><option :value="120">120 FPS</option><option :value="144">144 FPS</option><option :value="145">145 FPS</option></select></label>
          <div class="camera-test"><video v-if="cameraTestStream" ref="cameraPreview" autoplay playsinline muted></video><p v-else>Test your webcam before joining a call.</p><button type="button" @click="cameraTestStream ? stopCameraTest() : testCamera()">{{ cameraTestStream ? "Stop camera test" : "Test webcam" }}</button></div>
          ><button class="primary" @click="saveSettings">
            Save audio settings
          </button></template
        ><template v-else-if="settingsTab === 'appearance'"
          ><h2>Appearance</h2>
          <label
            >Theme<select v-model="settings.theme">
              <option value="system">System</option>
              <option value="dark">Dark</option>
              <option value="midnight">Midnight</option>
              <option value="light">Light</option>
            </select></label
          ><label>Accent colour<input v-model="settings.accentColor" type="color" /></label
          ><label>Interface density<select v-model="settings.density"><option value="compact">Compact</option><option value="default">Default</option><option value="spacious">Spacious</option></select></label
          ><label>Message spacing<select v-model="settings.messageSpacing"><option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="spacious">Spacious</option></select></label
          ><label class="toggle"
            ><input v-model="settings.compact" type="checkbox" /> Compact
            message spacing</label
          ><button class="primary" @click="saveSettings">
            Save appearance
          </button></template
        ><template v-else-if="settingsTab === 'accessibility'"
          ><h2>Accessibility</h2>
          <label>Text size <output>{{ settings.textSize }}%</output><input v-model.number="settings.textSize" type="range" min="85" max="130" step="5" /></label>
          <label class="toggle"><input v-model="settings.reducedMotion" type="checkbox" /> Reduce motion</label>
          <label class="toggle"><input v-model="settings.increasedContrast" type="checkbox" /> Increase contrast</label>
          <label class="toggle"><input v-model="settings.reducedTransparency" type="checkbox" /> Reduce transparency</label>
          <button class="primary" @click="saveSettings">Save accessibility</button></template
        ><template v-else-if="settingsTab === 'notifications'"
          ><h2>Notifications</h2>
          <label class="toggle"
            ><input v-model="settings.notifications" type="checkbox" /> Enable
            desktop notifications</label
          ><button class="primary" @click="saveSettings">
            Save notifications
          </button></template
        ><template v-else-if="settingsTab === 'privacy'"
          ><h2>Privacy &amp; Safety</h2>
          <label class="toggle"><input v-model="settings.showMessagePreviews" type="checkbox" /> Show message previews in notifications</label>
          <p class="settings-help">Direct-message encryption and community moderation policies continue to use LibraCord's existing security controls.</p>
          <button class="primary" @click="saveSettings">Save privacy settings</button></template
        ><template v-else-if="settingsTab === 'language'"
          ><h2>Language</h2>
          <label>Display language<select v-model="settings.language"><option value="en-GB">English (UK)</option><option value="en-US">English (US)</option></select></label>
          <button class="primary" @click="saveSettings">Save language</button></template
        ><template v-else-if="settingsTab === 'desktop'"
          ><h2>Desktop app</h2>
          <p class="settings-help">Configure how LibraCord behaves in the installed app.</p>
          <label class="toggle"><input v-model="settings.soundEffects" type="checkbox" /> Play message and voice sounds</label>
          <label class="toggle"><input v-model="settings.notifications" type="checkbox" /> Show desktop notifications</label>
          <label class="toggle"><input v-model="settings.compact" type="checkbox" /> Use compact message spacing</label>
          <label v-if="isDesktopApp" class="toggle"><input v-model="settings.hardwareAcceleration" type="checkbox" /> Use hardware acceleration for video</label>
          <p v-if="isDesktopApp" class="settings-help">Restart the desktop app after changing this setting.</p>
          <button class="primary" @click="saveSettings">Save desktop settings</button></template
        ><template v-else-if="settingsTab === 'advanced'"
          ><h2>Advanced</h2>
          <p class="settings-help">These controls affect rendering throughout the current device.</p>
          <label v-if="isDesktopApp" class="toggle"><input v-model="settings.hardwareAcceleration" type="checkbox" /> Hardware-accelerated video</label>
          <button class="primary" @click="saveSettings">Save advanced settings</button></template
        ><template v-else
          ><h2>Change Password</h2>
          <label
            >Current password<input
              v-model="passwords.current"
              type="password"
              autocomplete="current-password" /></label
          ><label
            >New password<input
              v-model="passwords.next"
              type="password"
              minlength="10"
              autocomplete="new-password" /></label
          ><button class="primary" @click="changePassword">
            Change password
          </button></template
        >
        </div>
      </section>
    </div>
    <div v-if="incomingDmCall" class="dm-call-modal" @click.self="incomingDmCall = null"><div class="dm-call-card"><h3>Incoming {{ incomingDmCall.mode }} call</h3><p>{{ incomingDmCall.callerName }} is calling you.</p><button class="secondary" @click="socket.emit('dm:call-response', { recipientId: incomingDmCall.callerId, accepted: false, callId: incomingDmCall.callId }); incomingDmCall = null">Decline</button><button class="primary" @click="socket.emit('dm:call-response', { recipientId: incomingDmCall.callerId, accepted: true, callId: incomingDmCall.callId }); openDm({ id: incomingDmCall.callerId, display_name: incomingDmCall.callerName }); incomingDmCall = null">Accept</button></div></div>
    <div v-if="imageLightbox" class="image-lightbox" role="dialog" aria-modal="true" :aria-label="imageLightbox.name" @click.self="closeImageLightbox">
      <header><strong>{{ imageLightbox.name }}</strong><div><a :href="imageLightbox.source" target="_blank" rel="noopener" download>Download</a><button type="button" title="Close image" @click="closeImageLightbox">×</button></div></header>
      <button type="button" class="image-lightbox-stage" title="Close image" @click="closeImageLightbox"><img :src="imageLightbox.source" :alt="imageLightbox.name" /></button>
    </div>
    <div v-if="dmCallRoom" class="dm-call-stage"><div class="dm-call-card"><span class="eyebrow">PRIVATE CALL</span><h3>{{ dmTarget?.display_name }}</h3><p>Connected securely via LiveKit</p><div class="voice-bottom-toolbar"><button @click="toggleDmMute"><FontAwesomeIcon :icon="dmCallMuted ? faMicrophoneSlash : faMicrophone" /></button><button @click="leaveDmCall" class="hangup"><FontAwesomeIcon :icon="faPhoneSlash" /></button></div></div></div>
    <div id="remote-audio"></div>
    <div v-if="cropper" class="image-crop-modal" @click.self="closeImageCrop">
      <div class="image-crop-card">
        <h2>Crop image</h2>
        <p>{{ cropper.kind.includes('banner') ? 'Banner · 3:1' : 'Avatar · square' }}</p>
        <div class="image-crop-preview" :class="{ 'banner-crop': cropper.kind.includes('banner') }">
          <img :src="cropper.url" :style="{ transform: `translate(-50%, -50%) scale(${cropZoom})` }" alt="Crop preview" />
        </div>
        <label class="crop-zoom">Zoom <input v-model.number="cropZoom" type="range" min="1" max="3" step="0.05" /></label>
        <div class="image-crop-actions"><button class="secondary" type="button" @click="closeImageCrop">Cancel</button><button class="primary" type="button" @click="confirmImageCrop">Use image</button></div>
      </div>
    </div>
  </main>
</template>
