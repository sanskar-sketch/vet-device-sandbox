/**
 * js/hardware-registry.js
 *
 * Canonical list of exactly which physical hardware each module supports,
 * and the protocol/port used to reach it. This is what "USE_REAL_DEVICE"
 * ultimately connects to — the six diagnostic machines plus the Patient
 * Station, per the Vitarus Platform Architecture Overview (v1.1) §5.4.
 *
 * Drives both the Hardware Detection scan (js/hardware-scan.js) and the
 * README hardware table. Keep this the single source of truth for
 * "what hardware do we support and on what port."
 */

const HARDWARE_REGISTRY = [
  {
    key: "patientStation",
    label: "Patient Station",
    icon: "🪪",
    supportedModels: ["Generic USB-HID ISO 11784/11785 microchip reader", "RS-232 veterinary weight scale", "USB3 Vision BCS camera"],
    protocol: "USB-HID + Serial → WS bridge",
    endpoint: "ws://localhost:8097/patient",
    portNote: "scale: COM7 · reader: USB-HID",
    bridgeNeeded: true
  },
  {
    key: "orbbec",
    label: "Structural / Depth Imaging",
    icon: "🎥",
    supportedModels: ["Orbbec Femto Mega", "Intel RealSense D455", "Luxonis OAK-D", "Azure Kinect"],
    protocol: "Orbbec SDK (USB 3.0 / Ethernet) → WS bridge",
    endpoint: "ws://localhost:8091/orbbec",
    portNote: "192.168.1.100:8090",
    bridgeNeeded: true
  },
  {
    key: "flir",
    label: "Thermal Imaging",
    icon: "🌡️",
    supportedModels: ["FLIR T865", "FLIR A700", "FLIR T540", "FLIR A40/A50/A70", "HIKMICRO", "Testo"],
    protocol: "REST API (direct HTTP GET)",
    endpoint: "http://192.168.0.100/api",
    portNote: "TCP 80",
    bridgeNeeded: false
  },
  {
    key: "clarius",
    label: "Ultrasound",
    icon: "🔊",
    supportedModels: ["Clarius C7 Vet HD3", "Clarius Wireless", "Mindray", "Butterfly (vet-compatible)", "Esaote"],
    protocol: "Cast API (TCP) → WS bridge",
    endpoint: "ws://localhost:8092/clarius",
    portNote: "probe TCP 5828",
    bridgeNeeded: true
  },
  {
    key: "vemo",
    label: "Cardiac (ECG + Stethoscope)",
    icon: "💓",
    supportedModels: ["Bionet VEMO (6-lead)", "Wireless ECG patches", "Eko digital stethoscope", "Thinklabs digital stethoscope", "Pulse oximeter", "Electronic blood pressure"],
    protocol: "Serial / TCP (BT-Link) → WS bridge",
    endpoint: "ws://localhost:8093/vemo",
    portNote: "192.168.1.50:3000",
    bridgeNeeded: true
  },
  {
    key: "tekscan",
    label: "Gait Analysis",
    icon: "🐾",
    supportedModels: ["Tekscan Animal Strideway", "Zebris pressure walkway", "Intel RealSense (camera array)", "Azure Kinect (camera array)", "Sony global-shutter cameras"],
    protocol: "COM SDK → WS bridge",
    endpoint: "ws://localhost:8094/tekscan",
    portNote: "48×64 sensel mat, 100 Hz",
    bridgeNeeded: true
  },
  {
    key: "vetscan",
    label: "Blood Laboratory",
    icon: "🩸",
    supportedModels: ["Vetscan VS2", "Vetscan OptiCell", "IDEXX Catalyst", "Heska", "Zoetis", "Mindray", "Abaxis"],
    protocol: "Serial / ASTM E1394 → WS bridge (or REST middleware)",
    endpoint: "ws://localhost:8095/vetscan",
    portNote: "REST fallback :8096/api/vetscan",
    bridgeNeeded: true
  }
];

/** Look up a registry entry by device key. */
function hwLookup(key) {
  return HARDWARE_REGISTRY.find(h => h.key === key);
}
