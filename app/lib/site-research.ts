import type { DesignReportProjectFacts } from "@/app/generated/contracts";

type ProjectFact = DesignReportProjectFacts["facts"][number];
type FetchLike = typeof fetch;

const SITE_RESEARCH_DOCUMENT_ID = "DOC_SITE_RESEARCH";
const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const ELEVATION_ENDPOINT = "https://api.open-meteo.com/v1/elevation";

interface GeocodeResult {
  lat: string;
  lon: string;
  display_name: string;
  osm_type?: string;
  osm_id?: number;
  type?: string;
  addresstype?: string;
  address?: Record<string, string>;
}

interface AmapGeocodeResponse {
  status: string;
  info?: string;
  infocode?: string;
  geocodes?: Array<{
    formatted_address?: string;
    province?: string;
    city?: string;
    district?: string;
    township?: string;
    neighborhood?: { name?: string } | string;
    building?: { name?: string } | string;
    adcode?: string;
    level?: string;
    location?: string;
  }>;
}

interface AmapPoi {
  id?: string;
  name?: string;
  type?: string;
  typecode?: string;
  address?: string | string[];
  location?: string;
  distance?: string;
  pname?: string;
  cityname?: string;
  adname?: string;
}

interface AmapPoiResponse {
  status: string;
  info?: string;
  infocode?: string;
  pois?: AmapPoi[];
}

export interface SiteResearchOptions {
  amapApiKey?: string;
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

interface NearbyPlace {
  name: string;
  kind: string;
  distance: number;
  element: OverpassElement;
}

export interface SiteResearchResult {
  projectFacts: DesignReportProjectFacts;
  status: "completed" | "partial" | "skipped";
  query?: string;
  summary: string;
  factCount: number;
  warnings: string[];
}

function valueAsText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function siteLocationFact(projectFacts: DesignReportProjectFacts) {
  const preferredPaths = [
    "site.location_detail",
    "site.location_visual",
    "site.location",
    "project.address",
    "site.address",
    "project.location",
  ];
  const candidatesByPath = preferredPaths.map((fieldPath) => ({
    fieldPath,
    candidates: projectFacts.facts
      .filter(
        (candidate) =>
          candidate.field_path === fieldPath &&
          candidate.status !== "superseded",
      )
      .map((fact) => ({ fact, value: valueAsText(fact.value_raw) }))
      .filter((item) => item.value),
  }));
  const candidates = candidatesByPath.find(
    ({ candidates: pathCandidates }) => pathCandidates.length > 0,
  )?.candidates ?? [];
  if (!candidates.length) return undefined;
  const primary = [...candidates].sort((left, right) => {
    const leftSpecificity = /地块|道路|公园|大厦|大学|地铁/u.test(left.value)
      ? 1
      : 0;
    const rightSpecificity = /地块|道路|公园|大厦|大学|地铁/u.test(right.value)
      ? 1
      : 0;
    return rightSpecificity - leftSpecificity || left.value.length - right.value.length;
  })[0];
  return {
    value: primary.value,
    quote: projectFacts.facts
      .filter(
        (candidate) =>
          preferredPaths.includes(candidate.field_path) &&
          candidate.status !== "superseded",
      )
      .map((fact) => ({ fact, value: valueAsText(fact.value_raw) }))
      .map(({ fact, value }) => fact.source.quote || value)
      .filter(Boolean)
      .join("；"),
  };
}

function normalizeLocationPhrase(value: string) {
  return value
    .normalize("NFKC")
    .replace(/^(?:项目|基地|地块|场地)(?:位置|区位)?(?:位于|坐落于|地处)?\s*/u, "")
    .replace(/[。；;]+$/u, "")
    .trim();
}

function uniqueLocationQueries(value: string, sourceQuote: string) {
  const normalized = normalizeLocationPhrase(value);
  const source = normalizeLocationPhrase(
    sourceQuote.replace(/^[^：:]{1,12}[：:]\s*/u, ""),
  );
  const primaryClause = normalized
    .split(/[，,；;]/u)[0]
    ?.replace(/(?:东|西|南|北)?(?:邻|临|接|靠近|毗邻).*/u, "")
    .trim();
  const sourcePrimaryClause = source.split(/[，,；;]/u)[0]?.trim();
  const administrative = normalized.match(
    /[^，,；;]{0,24}?(?:省|自治区|特别行政区)?[^，,；;]{1,12}市(?:[^，,；;]{1,12}(?:区|县|镇|街道))?/u,
  )?.[0];
  return [...new Set([primaryClause, sourcePrimaryClause, normalized, administrative])]
    .map((candidate) => candidate?.trim() ?? "")
    .filter((candidate) => candidate.length >= 2)
    .slice(0, 3);
}

function administrativeTokens(value: string) {
  return [
    ...value.matchAll(/([\p{Script=Han}]{2,12}?)(?:省|市|区|县|镇|街道)/gu),
  ]
    .map((match) => match[1])
    .filter((token) => !["项目", "基地", "场地", "地块"].includes(token));
}

function cityContext(value: string) {
  const full = value.match(/[\p{Script=Han}]{2,10}市/gu)?.[0];
  if (full) return full;
  const short = value.match(/(?:广州|深圳|珠海|北京|上海|天津|重庆|武汉|杭州|南京|苏州|成都|西安|长沙|厦门|福州|青岛|济南|郑州|合肥|昆明|南宁|海口|台北|新竹)/u)?.[0];
  return short ? `${short}市` : "";
}

function landmarkAnchorCandidates(value: string) {
  const city = cityContext(value);
  const matches = [
    ...value.matchAll(
      /([\p{Script=Han}A-Za-z0-9·]{2,24}(?:花园|大厦|大学|学院|公园|广场|车站|地铁站|商务区|金融城|体育场|博物馆|展览馆|会展中心|码头))/gu,
    ),
  ]
    .map((match) =>
      (match[1].split(/(?:为|临|邻|接|望|隔)/u).at(-1) ?? match[1])
        .replace(/^(?:东|西|南|北)(?:侧)?/u, "")
        .trim(),
    )
    .filter(
      (candidate) =>
        candidate.length >= 3 &&
        !/^(?:项目|场地|基地|地块|城市|公共|周边)/u.test(candidate),
    );
  return [...new Set(matches)]
    .map((anchor) => ({ anchor, query: `${anchor}${city ? ` ${city}` : ""}` }))
    .slice(0, 5);
}

function landmarkMatchesResult(
  result: GeocodeResult,
  anchor: string,
  context: string,
) {
  const compact = (value: string) =>
    value.replace(/[\s·,，()（）\-_/]/g, "").toLocaleLowerCase("zh-CN");
  const compactAnchor = compact(anchor);
  const primaryName = compact(result.display_name.split(/[,，]/u)[0] ?? "");
  const addressNames = Object.values(result.address ?? {}).map(compact);
  const primaryIsAnchor =
    primaryName === compactAnchor ||
    (primaryName.startsWith(compactAnchor) &&
      primaryName.length <= compactAnchor.length + 4);
  const addressContainsAnchor = addressNames.some(
    (value) =>
      value === compactAnchor ||
      (value.startsWith(compactAnchor) &&
        value.length <= compactAnchor.length + 4),
  );
  return (
    (primaryIsAnchor || addressContainsAnchor) &&
    geocodeMatchesQuery(result, context) &&
    !isBroadAdministrativeResult(result)
  );
}

function specificLocationMatchesResult(
  result: GeocodeResult,
  query: string,
) {
  if (isBroadAdministrativeResult(result) || !geocodeMatchesQuery(result, query)) {
    return false;
  }
  const compact = (value: string) =>
    value.replace(/[\s·,，()（）\-_/]/g, "").toLocaleLowerCase("zh-CN");
  const compactQuery = compact(query);
  const primaryName = compact(result.display_name.split(/[,，]/u)[0] ?? "");
  if (primaryName.length >= 4 && compactQuery.includes(primaryName)) {
    return true;
  }
  return landmarkAnchorCandidates(query).some(({ anchor }) =>
    landmarkMatchesResult(result, anchor, query),
  );
}

function geocodeMatchesQuery(result: GeocodeResult, query: string) {
  const tokens = administrativeTokens(query);
  if (!tokens.length) return true;
  const haystack = `${result.display_name} ${Object.values(result.address ?? {}).join(" ")}`;
  return tokens.some((token) => haystack.includes(token));
}

function isBroadAdministrativeResult(result: GeocodeResult) {
  return /^(?:administrative|state|province|region|county|city|municipality|district|town|village)$/i.test(
    result.addresstype ?? result.type ?? "",
  );
}

function coordinateFromText(value: string) {
  const latitudeFirst = value.match(
    /(?:纬度|lat(?:itude)?|北纬)?\s*(-?\d{1,2}\.\d{3,})\s*[,，/、\s]+(?:经度|lon(?:gitude)?|东经)?\s*(-?\d{2,3}\.\d{3,})/iu,
  );
  const longitudeFirst = value.match(
    /(?:经度|lon(?:gitude)?|东经)\s*(-?\d{2,3}\.\d{3,})\s*[,，/、\s]+(?:纬度|lat(?:itude)?|北纬)\s*(-?\d{1,2}\.\d{3,})/iu,
  );
  const latitude = Number(latitudeFirst?.[1] ?? longitudeFirst?.[2]);
  const longitude = Number(latitudeFirst?.[2] ?? longitudeFirst?.[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
    ? { latitude, longitude }
    : undefined;
}

function withTimeout(ms: number) {
  return AbortSignal.timeout(ms);
}

async function fetchJson<T>(
  fetcher: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T> {
  const response = await fetcher(url, {
    ...init,
    signal: withTimeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`.trim());
  }
  return (await response.json()) as T;
}

function haversineDistance(
  originLat: number,
  originLon: number,
  targetLat: number,
  targetLon: number,
) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const deltaLat = radians(targetLat - originLat);
  const deltaLon = radians(targetLon - originLon);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(originLat)) *
      Math.cos(radians(targetLat)) *
      Math.sin(deltaLon / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function placeCoordinates(element: OverpassElement) {
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  return Number.isFinite(lat) && Number.isFinite(lon)
    ? { lat: Number(lat), lon: Number(lon) }
    : undefined;
}

function translatedKind(tags: Record<string, string>) {
  const value =
    tags.station ??
    tags.railway ??
    tags.public_transport ??
    tags.highway ??
    tags.leisure ??
    tags.natural ??
    tags.waterway ??
    tags.tourism ??
    tags.historic ??
    tags.amenity ??
    tags.building ??
    "地点";
  const labels: Record<string, string> = {
    subway: "地铁站",
    subway_entrance: "地铁出入口",
    station: "轨道站",
    tram_stop: "有轨电车站",
    bus_stop: "公交站",
    stop_position: "公共交通站点",
    platform: "公共交通站台",
    park: "公园",
    garden: "花园",
    water: "水体",
    river: "河流",
    stream: "溪流",
    museum: "博物馆",
    attraction: "城市节点",
    monument: "纪念性节点",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function namedPlaces(
  response: OverpassResponse,
  originLat: number,
  originLon: number,
) {
  const deduped = new Map<string, NearbyPlace>();
  for (const element of response.elements ?? []) {
    const tags = element.tags ?? {};
    const name = (tags["name:zh"] ?? tags.name ?? tags["name:en"] ?? "").trim();
    const coordinates = placeCoordinates(element);
    if (!name || !coordinates) continue;
    const place: NearbyPlace = {
      name,
      kind: translatedKind(tags),
      distance: haversineDistance(
        originLat,
        originLon,
        coordinates.lat,
        coordinates.lon,
      ),
      element,
    };
    const current = deduped.get(name);
    if (!current || place.distance < current.distance) deduped.set(name, place);
  }
  return [...deduped.values()].sort((a, b) => a.distance - b.distance);
}

function distanceLabel(distance: number) {
  return distance < 1_000
    ? `约${Math.max(10, Math.round(distance / 10) * 10)}米`
    : `约${(distance / 1_000).toFixed(1)}公里`;
}

function rawPlaceQuote(places: NearbyPlace[]) {
  return JSON.stringify(
    places.map((place) => ({
      type: place.element.type,
      id: place.element.id,
      name:
        place.element.tags?.["name:zh"] ??
        place.element.tags?.name ??
        place.element.tags?.["name:en"],
      tags: place.element.tags,
      distance_m: place.distance,
    })),
  );
}

function researchFact(
  factId: string,
  fieldPath: string,
  value: string,
  sourceUrl: string,
  quote: string,
  retrievedAt: string,
  category: ProjectFact["category"] = "site",
  confidence = 0.78,
  status: ProjectFact["status"] = "confirmed",
): ProjectFact {
  return {
    fact_id: factId,
    category,
    field_path: fieldPath,
    value_raw: value,
    value_normalized: value,
    value_origin: "external_research",
    source: {
      document_id: SITE_RESEARCH_DOCUMENT_ID,
      page: 1,
      location_note: "公开地理数据自动检索",
      url: sourceUrl,
      retrieved_at: retrievedAt,
      quote,
    },
    source_role: "research_fact",
    confidence,
    status,
    notes:
      "自动场地研究结果，仅作为前期分析线索；如与现场或正式资料不符，请在事实库中删除。",
  };
}

function withoutPreviousResearch(projectFacts: DesignReportProjectFacts) {
  return {
    ...projectFacts,
    documents: projectFacts.documents.filter(
      (document) => document.role !== "site_research",
    ),
    facts: projectFacts.facts.filter(
      (fact) => fact.source_role !== "research_fact",
    ),
  };
}

function friendlyResearchError(error: unknown, service: string) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/USERKEY_PLAT_NOMATCH|10009/i.test(message)) {
    return "当前高德 Key 的服务类型不匹配：请在高德控制台创建“Web服务”Key，而不是“Web端（JS API）”Key；任务书中的场地事实仍然保留。";
  }
  if (/INVALID_USER_KEY|10001/i.test(message)) {
    return "当前高德 Web 服务 Key 无效，请检查控制台中的 Key；任务书中的场地事实仍然保留。";
  }
  if (/CUQPS_HAS_EXCEEDED_THE_LIMIT|DAILY_QUERY_OVER_LIMIT|10003|10004/i.test(message)) {
    return "高德地图调用额度已用尽，本次未取得新增公开数据；任务书中的场地事实仍然保留。";
  }
  if (/aborted|timeout|timed out/i.test(message)) {
    return `${service}响应超时，本次未取得新增公开数据；任务书中的场地事实仍然保留。`;
  }
  return `${service}暂时不可用，本次未取得新增公开数据；任务书中的场地事实仍然保留。`;
}

function amapLocation(value?: string) {
  const [longitude, latitude] = String(value ?? "")
    .split(",")
    .map(Number);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  return { latitude, longitude };
}

function amapAddressValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.join("、") : value ?? "";
}

function amapGeocodeMatchesContext(
  geocode: NonNullable<AmapGeocodeResponse["geocodes"]>[number],
  query: string,
  city: string,
) {
  const haystack = [
    geocode.formatted_address,
    geocode.province,
    geocode.city,
    geocode.district,
    geocode.township,
  ]
    .map((value) => amapAddressValue(value))
    .filter(Boolean)
    .join(" ");
  const cityToken = city.replace(/市$/u, "");
  if (cityToken && !haystack.includes(cityToken)) return false;

  const projectAnchors = [
    "珠江新城",
    "马场",
    "金融城",
    "琶洲",
    "黄埔大道",
    "暨南大学",
    "跑马地",
    "珠江商务大厦",
  ].filter((anchor) => query.includes(anchor));
  return (
    projectAnchors.length === 0 ||
    projectAnchors.some((anchor) => haystack.includes(anchor))
  );
}

function amapFactDocument(
  cleanFacts: DesignReportProjectFacts,
  retrievedAt: string,
  facts: ProjectFact[],
) {
  return {
    ...cleanFacts,
    documents: [
      ...cleanFacts.documents,
      {
        document_id: SITE_RESEARCH_DOCUMENT_ID,
        file_name: "自动场地研究（高德开放平台）",
        role: "site_research" as const,
        version_or_date: retrievedAt,
        authority_rank: 4,
        notes: "高德开放平台 Web 服务；仅作为前期分析线索。",
      },
    ],
    facts: [...cleanFacts.facts, ...facts],
  };
}

async function researchSiteContextWithAmap(
  cleanFacts: DesignReportProjectFacts,
  locationFact: { value: string; quote: string },
  query: string,
  apiKey: string,
  fetcher: FetchLike,
): Promise<SiteResearchResult> {
  const city = cityContext(`${locationFact.value} ${locationFact.quote}`);
  const queryCandidates = uniqueLocationQueries(
    locationFact.value,
    locationFact.quote,
  );
  const directCoordinates = coordinateFromText(
    `${locationFact.value} ${locationFact.quote}`,
  );
  let coordinates = directCoordinates;
  let displayName = normalizeLocationPhrase(locationFact.value);
  let matchedQuery = query;
  let approximateAnchor: string | undefined;
  let geocodeRaw: unknown;
  let lastError: unknown;

  if (!coordinates) {
    for (const candidate of queryCandidates) {
      const url = new URL("https://restapi.amap.com/v3/geocode/geo");
      url.searchParams.set("key", apiKey);
      url.searchParams.set("address", candidate);
      if (city) url.searchParams.set("city", city);
      try {
        const response = await fetchJson<AmapGeocodeResponse>(
          fetcher,
          url.toString(),
          { headers: { Accept: "application/json" } },
          8_000,
        );
        if (response.status !== "1") {
          throw new Error(response.info || response.infocode || "高德地理编码失败");
        }
        const geocode = response.geocodes?.find(
          (item) =>
            amapLocation(item.location) &&
            amapGeocodeMatchesContext(item, candidate, city),
        );
        const parsed = amapLocation(geocode?.location);
        if (!geocode || !parsed) continue;
        coordinates = parsed;
        displayName = geocode.formatted_address || candidate;
        matchedQuery = candidate;
        geocodeRaw = geocode;
        break;
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (!coordinates) {
    for (const candidate of landmarkAnchorCandidates(
      `${locationFact.value} ${locationFact.quote}`,
    )) {
      const url = new URL("https://restapi.amap.com/v3/place/text");
      url.searchParams.set("key", apiKey);
      url.searchParams.set("keywords", candidate.anchor);
      if (city) {
        url.searchParams.set("city", city);
        url.searchParams.set("citylimit", "true");
      }
      url.searchParams.set("offset", "10");
      try {
        const response = await fetchJson<AmapPoiResponse>(
          fetcher,
          url.toString(),
          { headers: { Accept: "application/json" } },
          8_000,
        );
        if (response.status !== "1") {
          throw new Error(response.info || response.infocode || "高德地点检索失败");
        }
        const poi = response.pois?.find(
          (item) =>
            item.name?.includes(candidate.anchor) && amapLocation(item.location),
        );
        const parsed = amapLocation(poi?.location);
        if (!poi || !parsed) continue;
        coordinates = parsed;
        displayName = `${poi.name}${poi.address ? `，${amapAddressValue(poi.address)}` : ""}`;
        matchedQuery = candidate.query;
        approximateAnchor = candidate.anchor;
        geocodeRaw = poi;
        break;
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (!coordinates) {
    return {
      projectFacts: cleanFacts,
      status: "partial",
      query,
      summary: `已经读取任务书场地“${query}”，但高德暂时无法确认唯一研究中心。任务书图面与文字层提取的片区、道路和相邻关系仍可继续用于前期分析。`,
      factCount: 0,
      warnings: [friendlyResearchError(lastError, "高德地图服务")],
    };
  }

  const retrievedAt = new Date().toISOString();
  const { latitude, longitude } = coordinates;
  const isApproximate = Boolean(approximateAnchor) || !directCoordinates;
  const centerLabel = isApproximate ? "片区研究中心" : "场地中心";
  const mapUrl = `https://uri.amap.com/marker?position=${longitude},${latitude}&name=${encodeURIComponent(displayName)}&coordinate=gaode&callnative=0`;
  const facts: ProjectFact[] = [
    researchFact(
      "F_SITE_RESEARCH_LOCATION",
      "site.research.geocoded_location",
      isApproximate
        ? `依据任务书地址“${matchedQuery}”建立片区研究中心（${displayName}；高德坐标 ${longitude.toFixed(6)}, ${latitude.toFixed(6)}）。该坐标不代表项目红线或场地中心。`
        : `${displayName}（高德坐标 ${longitude.toFixed(6)}, ${latitude.toFixed(6)}）`,
      mapUrl,
      JSON.stringify(geocodeRaw ?? coordinates),
      retrievedAt,
      "site",
      isApproximate ? 0.65 : 0.88,
      isApproximate ? "needs_confirmation" : "confirmed",
    ),
  ];
  const warnings: string[] = [];
  const aroundUrl = new URL("https://restapi.amap.com/v3/place/around");
  aroundUrl.searchParams.set("key", apiKey);
  aroundUrl.searchParams.set("location", `${longitude},${latitude}`);
  aroundUrl.searchParams.set("radius", "2000");
  aroundUrl.searchParams.set("sortrule", "distance");
  aroundUrl.searchParams.set("offset", "25");
  aroundUrl.searchParams.set("extensions", "base");
  try {
    const response = await fetchJson<AmapPoiResponse>(
      fetcher,
      aroundUrl.toString(),
      { headers: { Accept: "application/json" } },
      8_000,
    );
    if (response.status !== "1") {
      throw new Error(response.info || response.infocode || "高德周边检索失败");
    }
    const pois = (response.pois ?? []).filter((poi) => poi.name).slice(0, 25);
    const groups = [
      {
        id: "F_SITE_RESEARCH_TRANSPORT",
        path: "site.research.transport",
        category: "circulation" as const,
        items: pois.filter((poi) => /地铁|公交|交通|车站|铁路|机场/i.test(`${poi.name} ${poi.type}`)).slice(0, 4),
      },
      {
        id: "F_SITE_RESEARCH_LANDSCAPE",
        path: "site.research.landscape",
        category: "site" as const,
        items: pois.filter((poi) => /公园|风景|花园|河|湖|水系|绿地/i.test(`${poi.name} ${poi.type}`)).slice(0, 4),
      },
    ];
    const usedIds = new Set(groups.flatMap((group) => group.items.map((poi) => poi.id)));
    groups.push({
      id: "F_SITE_RESEARCH_LANDMARKS",
      path: "site.research.landmarks",
      category: "site",
      items: pois.filter((poi) => !usedIds.has(poi.id)).slice(0, 4),
    });
    for (const group of groups) {
      if (!group.items.length) continue;
      const value = group.items
        .map((poi) => `${poi.name}（${poi.type || "周边节点"}${poi.distance ? `，距${centerLabel}${distanceLabel(Number(poi.distance))}` : ""}）`)
        .join("；");
      facts.push(
        researchFact(
          group.id,
          group.path,
          value,
          mapUrl,
          JSON.stringify(group.items),
          retrievedAt,
          group.category,
          isApproximate ? 0.62 : 0.78,
          isApproximate ? "needs_confirmation" : "confirmed",
        ),
      );
    }
  } catch (error) {
    warnings.push(friendlyResearchError(error, "高德周边设施检索"));
  }

  return {
    projectFacts: amapFactDocument(cleanFacts, retrievedAt, facts),
    status: warnings.length || isApproximate ? "partial" : "completed",
    query,
    summary: `已使用高德地图根据“${query}”完成${isApproximate ? "片区级" : "场地级"}公开数据增强，写入 ${facts.length} 条可追溯事实；页面框架保持不变。`,
    factCount: facts.length,
    warnings,
  };
}

export function preserveSiteResearchFacts(
  current: DesignReportProjectFacts,
  next: DesignReportProjectFacts,
): DesignReportProjectFacts {
  const researchDocuments = current.documents.filter(
    (document) => document.role === "site_research",
  );
  const researchFacts = current.facts.filter(
    (fact) => fact.source_role === "research_fact",
  );
  if (!researchDocuments.length && !researchFacts.length) return next;
  return {
    ...next,
    documents: [
      ...next.documents.filter((document) => document.role !== "site_research"),
      ...researchDocuments,
    ],
    facts: [
      ...next.facts.filter((fact) => fact.source_role !== "research_fact"),
      ...researchFacts,
    ],
  };
}

export function removeSiteResearchFact(
  projectFacts: DesignReportProjectFacts,
  factId: string,
) {
  const facts = projectFacts.facts.filter((fact) => fact.fact_id !== factId);
  const hasResearchFacts = facts.some(
    (fact) => fact.source_role === "research_fact",
  );
  return {
    ...projectFacts,
    facts,
    documents: hasResearchFacts
      ? projectFacts.documents
      : projectFacts.documents.filter(
          (document) => document.role !== "site_research",
        ),
  };
}

export async function researchSiteContext(
  projectFacts: DesignReportProjectFacts,
  fetcher: FetchLike = fetch,
  options: SiteResearchOptions = {},
): Promise<SiteResearchResult> {
  const cleanFacts = withoutPreviousResearch(projectFacts);
  const locationFact = siteLocationFact(projectFacts);
  if (!locationFact) {
    return {
      projectFacts: cleanFacts,
      status: "skipped",
      summary: "任务书中没有可用于定位的场地地址，未写入场地研究事实。",
      factCount: 0,
      warnings: ["缺少项目区位或详细地址。"],
    };
  }
  const query = locationFact.value;
  const amapApiKey =
    options.amapApiKey?.trim() || process.env.AMAP_WEB_SERVICE_KEY?.trim();
  if (amapApiKey) {
    return researchSiteContextWithAmap(
      cleanFacts,
      locationFact,
      query,
      amapApiKey,
      fetcher,
    );
  }
  if (fetcher === fetch) {
    return {
      projectFacts: cleanFacts,
      status: "partial",
      query,
      summary: `已经读取任务书场地“${query}”。当前未配置高德 Web 服务 Key，因此不再请求不稳定的境外公共地图；任务书图面与文字层事实仍可直接支持片区级分析。`,
      factCount: 0,
      warnings: ["请在 API 设置中填写高德 Web 服务 Key，以补充坐标与周边公共设施。"],
    };
  }
  const queryCandidates = uniqueLocationQueries(
    locationFact.value,
    locationFact.quote,
  );
  const directCoordinates = coordinateFromText(
    `${locationFact.value} ${locationFact.quote}`,
  );
  let geocoded: GeocodeResult | undefined;
  let broadGeocoded: GeocodeResult | undefined;
  let approximateAnchor: string | undefined;
  let matchedQuery = query;
  let lastGeocodeError: unknown;
  if (directCoordinates) {
    geocoded = {
      lat: String(directCoordinates.latitude),
      lon: String(directCoordinates.longitude),
      display_name: normalizeLocationPhrase(locationFact.value),
      type: "coordinates",
      addresstype: "coordinates",
    };
  } else {
    for (const [index, candidate] of queryCandidates.entries()) {
      const geocodeUrl = new URL(NOMINATIM_ENDPOINT);
      geocodeUrl.searchParams.set("format", "jsonv2");
      geocodeUrl.searchParams.set("limit", "5");
      geocodeUrl.searchParams.set("addressdetails", "1");
      geocodeUrl.searchParams.set("q", candidate);
      try {
        const results = await fetchJson<GeocodeResult[]>(
          fetcher,
          geocodeUrl.toString(),
          {
            headers: {
              Accept: "application/json",
              "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
              "User-Agent": "ArchitecturalReportWorkbench/1.0 (site research)",
            },
          },
          8_000,
        );
        const relevantResults = results.filter((result) =>
          geocodeMatchesQuery(result, candidate),
        );
        geocoded = relevantResults.find((result) =>
          specificLocationMatchesResult(result, candidate),
        );
        broadGeocoded ??= relevantResults.find(isBroadAdministrativeResult);
        if (geocoded) {
          matchedQuery = candidate;
          const relationalAnchor = landmarkAnchorCandidates(candidate).find(
            ({ anchor }) =>
              geocoded &&
              landmarkMatchesResult(geocoded, anchor, candidate),
          );
          if (
            relationalAnchor &&
            /(?:东|西|南|北)(?:侧)?(?:为|临|邻|接|望)|紧邻|毗邻/u.test(
              candidate,
            )
          ) {
            approximateAnchor = relationalAnchor.anchor;
          }
          break;
        }
      } catch (error) {
        lastGeocodeError = error;
      }
      if (fetcher === fetch && index < queryCandidates.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }
  }
  if (!geocoded && !directCoordinates) {
    const anchors = landmarkAnchorCandidates(
      `${locationFact.value} ${locationFact.quote}`,
    );
    for (const [index, candidate] of anchors.entries()) {
      const geocodeUrl = new URL(NOMINATIM_ENDPOINT);
      geocodeUrl.searchParams.set("format", "jsonv2");
      geocodeUrl.searchParams.set("limit", "5");
      geocodeUrl.searchParams.set("addressdetails", "1");
      geocodeUrl.searchParams.set("q", candidate.query);
      try {
        const results = await fetchJson<GeocodeResult[]>(
          fetcher,
          geocodeUrl.toString(),
          {
            headers: {
              Accept: "application/json",
              "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
              "User-Agent": "ArchitecturalReportWorkbench/1.0 (site research)",
            },
          },
          8_000,
        );
        geocoded = results.find((result) =>
          landmarkMatchesResult(
            result,
            candidate.anchor,
            `${candidate.query} ${locationFact.value}`,
          ),
        );
        if (geocoded) {
          matchedQuery = candidate.query;
          approximateAnchor = candidate.anchor;
          break;
        }
      } catch (error) {
        lastGeocodeError = error;
      }
      if (fetcher === fetch && index < anchors.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }
  }
  if (!geocoded && lastGeocodeError) {
    return {
      projectFacts: cleanFacts,
      status: "partial",
      query,
      summary: `已经读取任务书场地“${query}”。公开地图服务暂时不可用，但任务书中的片区、道路与相邻关系仍保留在事实库，可继续支持片区级场地分析。`,
      factCount: 0,
      warnings: [
        lastGeocodeError instanceof Error
          ? lastGeocodeError.message
          : "场地位置检索失败",
      ],
    };
  }
  if (!geocoded) {
    return {
      projectFacts: cleanFacts,
      status: "partial",
      query,
      summary: `已经读取任务书场地“${query}”。公开地图${broadGeocoded ? `只能定位到“${broadGeocoded.display_name}”这一城市／行政范围` : "暂时无法确认唯一坐标"}，系统将按任务书已确认的片区、道路和相邻地标进行片区级分析，不阻断后续文案。`,
      factCount: 0,
      warnings: [
        `已尝试检索：${queryCandidates.join("；") || query}`,
        "当前研究精度为片区级：可以用于城市关系、交通与资源判断，不用于精确距离、红线或测绘结论。",
      ],
    };
  }

  const latitude = Number(geocoded.lat);
  const longitude = Number(geocoded.lon);
  const retrievedAt = new Date().toISOString();
  const isApproximate = Boolean(approximateAnchor);
  const researchCenterLabel = isApproximate ? "片区研究中心" : "场地中心";
  const mapUrl = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;
  const facts: ProjectFact[] = [
    researchFact(
      "F_SITE_RESEARCH_LOCATION",
      "site.research.geocoded_location",
      isApproximate
        ? `以相邻地标“${approximateAnchor}”作为片区研究中心（${geocoded.display_name}；坐标 ${latitude.toFixed(6)}, ${longitude.toFixed(6)}）。该坐标不代表项目红线或场地中心。`
        : `${geocoded.display_name}（依据“${matchedQuery}”定位；坐标 ${latitude.toFixed(6)}, ${longitude.toFixed(6)}）`,
      mapUrl,
      JSON.stringify(geocoded),
      retrievedAt,
      "site",
      isApproximate ? 0.62 : 0.88,
      isApproximate ? "needs_confirmation" : "confirmed",
    ),
  ];
  const warnings: string[] = [];

  const overpassQuery = `[out:json][timeout:6];(nwr(around:2000,${latitude},${longitude})[railway~"station|halt|tram_stop|subway_entrance"];nwr(around:2000,${latitude},${longitude})[public_transport~"station|platform|stop_position"];nwr(around:2000,${latitude},${longitude})[highway="bus_stop"];nwr(around:2000,${latitude},${longitude})[leisure~"park|garden"];nwr(around:2000,${latitude},${longitude})[natural];nwr(around:2000,${latitude},${longitude})[waterway];nwr(around:2000,${latitude},${longitude})[tourism];nwr(around:2000,${latitude},${longitude})[historic];nwr(around:2000,${latitude},${longitude})[amenity][name];nwr(around:2000,${latitude},${longitude})[building][name];);out center tags;`;
  const elevationOffset = 0.0045;
  const elevationUrl = new URL(ELEVATION_ENDPOINT);
  elevationUrl.searchParams.set(
    "latitude",
    [latitude, latitude + elevationOffset, latitude, latitude - elevationOffset, latitude].join(","),
  );
  elevationUrl.searchParams.set(
    "longitude",
    [longitude, longitude, longitude + elevationOffset, longitude, longitude - elevationOffset].join(","),
  );

  const [placesResult, elevationResult] = await Promise.allSettled([
    fetchJson<OverpassResponse>(
      fetcher,
      OVERPASS_ENDPOINT,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "ArchitecturalReportWorkbench/1.0 (site research)",
        },
        body: new URLSearchParams({ data: overpassQuery }).toString(),
      },
      8_000,
    ),
    fetchJson<{ elevation?: number[] }>(
      fetcher,
      elevationUrl.toString(),
      { headers: { Accept: "application/json" } },
      10_000,
    ),
  ]);

  if (placesResult.status === "fulfilled") {
    const places = namedPlaces(placesResult.value, latitude, longitude);
    const transport = places
      .filter((place) =>
        /地铁|轨道|公交|交通|station|platform|stop/i.test(place.kind),
      )
      .slice(0, 4);
    const landscape = places
      .filter((place) =>
        /公园|花园|水体|河流|溪流|park|garden|water|river|stream|natural/i.test(
          place.kind,
        ),
      )
      .slice(0, 4);
    const excludedIds = new Set(
      [...transport, ...landscape].map(
        (place) => `${place.element.type}/${place.element.id}`,
      ),
    );
    const landmarks = places
      .filter(
        (place) =>
          !excludedIds.has(`${place.element.type}/${place.element.id}`),
      )
      .slice(0, 4);

    for (const [factId, fieldPath, category, selected] of [
      ["F_SITE_RESEARCH_TRANSPORT", "site.research.transport", "circulation", transport],
      ["F_SITE_RESEARCH_LANDMARKS", "site.research.landmarks", "site", landmarks],
      ["F_SITE_RESEARCH_LANDSCAPE", "site.research.landscape", "site", landscape],
    ] as const) {
      if (!selected.length) continue;
      const value = selected
        .map(
          (place) =>
            `${place.name}（${place.kind}，距${researchCenterLabel}${distanceLabel(place.distance)}）`,
        )
        .join("；");
      facts.push(
        researchFact(
          factId,
          fieldPath,
          value,
          mapUrl,
          rawPlaceQuote(selected),
          retrievedAt,
          category,
          isApproximate ? 0.62 : 0.78,
          isApproximate ? "needs_confirmation" : "confirmed",
        ),
      );
    }
  } else {
    warnings.push(
      `周边设施检索失败：${placesResult.reason instanceof Error ? placesResult.reason.message : "未知错误"}`,
    );
  }

  if (elevationResult.status === "fulfilled") {
    const elevations = (elevationResult.value.elevation ?? []).filter(Number.isFinite);
    if (elevations.length) {
      const minimum = Math.min(...elevations);
      const maximum = Math.max(...elevations);
      const center = elevations[0];
      facts.push(
        researchFact(
          "F_SITE_RESEARCH_TERRAIN",
          "site.research.terrain",
          `${researchCenterLabel}公开高程约${center.toFixed(0)}米；研究中心及约500米四向采样高程为${minimum.toFixed(0)}–${maximum.toFixed(0)}米，高差约${(maximum - minimum).toFixed(0)}米。${isApproximate ? "该结果描述相邻片区地形，不代表项目红线内测绘高程。" : ""}`,
          elevationUrl.toString(),
          JSON.stringify({ latitude, longitude, elevation: elevations }),
          retrievedAt,
          "site",
          isApproximate ? 0.55 : 0.72,
          isApproximate ? "needs_confirmation" : "confirmed",
        ),
      );
    }
  } else {
    warnings.push(
      `地形高程检索失败：${elevationResult.reason instanceof Error ? elevationResult.reason.message : "未知错误"}`,
    );
  }

  const projectFactsWithResearch: DesignReportProjectFacts = {
    ...cleanFacts,
    documents: [
      ...cleanFacts.documents,
      {
        document_id: SITE_RESEARCH_DOCUMENT_ID,
        file_name: "自动场地研究（公开地理数据）",
        role: "site_research",
        version_or_date: retrievedAt,
        authority_rank: 4,
        notes: "OpenStreetMap/Nominatim/Overpass 与 Open-Meteo 高程数据；仅作为前期分析线索。",
      },
    ],
    facts: [...cleanFacts.facts, ...facts],
  };

  return {
    projectFacts: projectFactsWithResearch,
    status: warnings.length ? "partial" : "completed",
    query,
    summary: `已根据“${query}”完成${isApproximate ? `片区级场地研究（以“${approximateAnchor}”为近似研究中心）` : "场地研究"}，写入 ${facts.length} 条可追溯事实；页面框架保持不变。`,
    factCount: facts.length,
    warnings,
  };
}
