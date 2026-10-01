'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export interface AudiencePlace {
  city: string | null;
  country: string | null;
  lat: number;
  lng: number;
  visitors: number;
}

const countryName = (code: string | null) => {
  if (!code) return '';
  try {
    return new Intl.DisplayNames(['fr'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
};

/** Zooms the map onto the visitors once the places are known. */
function FitToPlaces({ places }: { places: AudiencePlace[] }) {
  const map = useMap();
  useEffect(() => {
    if (!places.length) return;
    if (places.length === 1) {
      map.setView([places[0].lat, places[0].lng], 6);
      return;
    }
    const lats = places.map((p) => p.lat);
    const lngs = places.map((p) => p.lng);
    map.fitBounds(
      [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
      { padding: [30, 30], maxZoom: 7 },
    );
  }, [map, places]);
  return null;
}

/** Bubble map of where the visitors of the public pages are (city level, approximate). */
export default function AudienceMap({ places }: { places: AudiencePlace[] }) {
  const max = Math.max(1, ...places.map((p) => p.visitors));

  return (
    <MapContainer
      center={[2, 20]}
      zoom={3}
      scrollWheelZoom={false}
      className="h-80 w-full rounded-lg z-0"
      attributionControl
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToPlaces places={places} />
      {places.map((p) => (
        <CircleMarker
          key={`${p.lat},${p.lng}`}
          center={[p.lat, p.lng]}
          radius={6 + 18 * Math.sqrt(p.visitors / max)}
          pathOptions={{ color: '#5C37FF', fillColor: '#5C37FF', fillOpacity: 0.45, weight: 1 }}
        >
          <Tooltip>
            <strong>{p.city || countryName(p.country) || 'Lieu inconnu'}</strong>
            {p.city && p.country ? `, ${countryName(p.country)}` : ''}
            <br />
            {p.visitors} personne{p.visitors > 1 ? 's' : ''}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
