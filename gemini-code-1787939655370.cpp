#include <SPI.h>
#include <UIPEthernet.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <PN5180.h>
#include <PN5180ISO15693.h>
#include <esp_task_wdt.h>

// ==========================================
// [ Pin Configurations ]
// ==========================================
#define SPI_SCK      18
#define SPI_MISO     19
#define SPI_MOSI     23
#define ETH_CS_PIN   5

// NFC 1
#define NFC1_NSS     4 
#define NFC1_BUSY    13
#define NFC1_RST     15

// NFC 2
#define NFC2_NSS     32
#define NFC2_BUSY    33
#define NFC2_RST     21

// Peripherals
#define BUZZER_PIN   25
#define LED_GREEN    26
#define LED_RED      27
#define LED_YELLOW   14

// ==========================================
// [ Network & MQTT Settings ]
// ==========================================
byte mac[] = { 0xDE, 0xAD, 0xBE, 0xEF, 0xFE, 0x01 };
const char* DEVICE_MAC_STR = "DE:AD:BE:EF:FE:01";
IPAddress myIP(192, 168, 1, 20);
IPAddress myDNS(192, 168, 1, 10);
IPAddress myGateway(192, 168, 1, 10);
IPAddress mySubnet(255, 255, 255, 0);
IPAddress brokerIP(192, 168, 1, 10);

EthernetClient ethClient;
PubSubClient mqttClient(ethClient);

const char* TOPIC_PUBLISH = "esp32/to/backend";
const char* TOPIC_SUBSCRIBE = "backend/to/esp32";
const char* ESP_ID = "6a89aaf987d2a6eae30e48af";

// ==========================================
// [ Hardware Objects & Variables ]
// ==========================================
PN5180ISO15693 nfc1(NFC1_NSS, NFC1_BUSY, NFC1_RST);
PN5180ISO15693 nfc2(NFC2_NSS, NFC2_BUSY, NFC2_RST);

unsigned long lastReconnectAttempt = 0;
unsigned long lastNFCPoll = 0;
const unsigned long NFC_POLL_INTERVAL = 100; 

// ------------------------------------------
// [ Smooth Scanning Variables ]
// ------------------------------------------
unsigned long globalScanCooldown = 0; 
const unsigned long SCAN_DELAY_MS = 1500; 

const int MAX_NFC2_ITER = 30;
const int MAX_NFC2_READS = 2; // Maximum 2 cards per cycle

const uint32_t WDT_TIMEOUT_SEC = 60;
unsigned long mqttReconnectDelay = 5000;
const unsigned long MQTT_RECONNECT_MAX_DELAY = 60000;

unsigned long lastPN5180Maintenance = 0;
const unsigned long PN5180_MAINTENANCE_INTERVAL = 6UL * 60UL * 60UL * 1000UL; 

// ==========================================
// [ Per-Reader Blocking System ]
// ==========================================
struct BlockedTag {
  uint8_t uid[8]; 
  unsigned long expireTimeNFC1; // NFC 1 အတွက် သီးသန့် Block ချိန်
  unsigned long expireTimeNFC2; // NFC 2 အတွက် သီးသန့် Block ချိန်
};
#define MAX_BLOCKED_TAGS 40 
BlockedTag blockedTags[MAX_BLOCKED_TAGS];

// ==========================================
// [ Feedback System ]
// ==========================================
enum FeedbackType { FB_NONE, FB_SUCCESS, FB_FAIL };
FeedbackType currentFeedback = FB_NONE;
FeedbackType pendingFeedbackType = FB_NONE;
int pendingFeedbackBeeps = 0;

int beepsTotal = 0;
int beepsDone = 0;
bool beepActive = false;
unsigned long lastFeedbackTime = 0;

const unsigned long BEEP_ON_TIME = 100;   
const unsigned long BEEP_OFF_TIME = 100;  
const unsigned long FAIL_BEEP_ON_TIME = 100;   
const unsigned long FAIL_BEEP_OFF_TIME = 100;  

void startFeedback(FeedbackType type, int beeps) {
  if (currentFeedback != FB_NONE) {
    pendingFeedbackType = type;
    pendingFeedbackBeeps = beeps;
    return;
  }

  currentFeedback = type;
  beepsTotal = beeps;
  beepsDone = 0;
  beepActive = true;
  lastFeedbackTime = millis();

  digitalWrite(LED_YELLOW, LOW);
  digitalWrite(LED_RED, LOW);
  digitalWrite(LED_GREEN, LOW);

  if (type == FB_FAIL) digitalWrite(LED_RED, HIGH);
  else if (type == FB_SUCCESS) digitalWrite(LED_GREEN, HIGH);
  
  digitalWrite(BUZZER_PIN, HIGH);
  
  if (type == FB_FAIL) Serial.println(">>> [FEEDBACK] FAIL (Red LED + Beeps)");
  else if (type == FB_SUCCESS) Serial.println(">>> [FEEDBACK] SUCCESS (Green LED + Beeps)");
}

void handleFeedback() {
  if (currentFeedback == FB_NONE) {
    if (pendingFeedbackType != FB_NONE) {
      FeedbackType t = pendingFeedbackType;
      int b = pendingFeedbackBeeps;
      pendingFeedbackType = FB_NONE;
      pendingFeedbackBeeps = 0;
      startFeedback(t, b);
    }
    return;
  }

  unsigned long currentMillis = millis();

  if (beepActive) {
    unsigned long onDuration = (currentFeedback == FB_FAIL) ? FAIL_BEEP_ON_TIME : BEEP_ON_TIME;
    if (currentMillis - lastFeedbackTime >= onDuration) {
      beepActive = false;
      lastFeedbackTime = currentMillis;
      digitalWrite(BUZZER_PIN, LOW);
      digitalWrite(LED_RED, LOW);
      digitalWrite(LED_GREEN, LOW);
      beepsDone++;
      if (beepsDone >= beepsTotal) currentFeedback = FB_NONE; 
    }
  } else {
    unsigned long offDuration = (currentFeedback == FB_FAIL) ? FAIL_BEEP_OFF_TIME : BEEP_OFF_TIME;
    if (currentMillis - lastFeedbackTime >= offDuration) {
      beepActive = true;
      lastFeedbackTime = currentMillis;
      digitalWrite(BUZZER_PIN, HIGH);
      if (currentFeedback == FB_FAIL) digitalWrite(LED_RED, HIGH);
      if (currentFeedback == FB_SUCCESS) digitalWrite(LED_GREEN, HIGH);
    }
  }
}

// ==========================================
// [ Helper & Blocking Functions ]
// ==========================================
void printUID(uint8_t *uid, char *output) {
  sprintf(output, "%02X:%02X:%02X:%02X:%02X:%02X:%02X:%02X",
          uid[7], uid[6], uid[5], uid[4], uid[3], uid[2], uid[1], uid[0]);
}

bool isTagBlocked(uint8_t *uid, int readerId) {
  unsigned long currentMillis = millis();
  for (int i = 0; i < MAX_BLOCKED_TAGS; i++) {
    if (memcmp(blockedTags[i].uid, uid, 8) == 0) {
      if (readerId == 1 && blockedTags[i].expireTimeNFC1 > currentMillis) return true;
      if (readerId == 2 && blockedTags[i].expireTimeNFC2 > currentMillis) return true;
      return false; 
    }
  }
  return false;
}

void blockTag(uint8_t *uid, unsigned long durationNFC1, unsigned long durationNFC2) {
  unsigned long currentMillis = millis();
  int emptySlot = -1;
  
  for (int i = 0; i < MAX_BLOCKED_TAGS; i++) {
    if (memcmp(blockedTags[i].uid, uid, 8) == 0) {
      if (durationNFC1 > 0) blockedTags[i].expireTimeNFC1 = currentMillis + durationNFC1;
      if (durationNFC2 > 0) blockedTags[i].expireTimeNFC2 = currentMillis + durationNFC2;
      return;
    }
    if (blockedTags[i].expireTimeNFC1 <= currentMillis && blockedTags[i].expireTimeNFC2 <= currentMillis) {
      emptySlot = i;
    }
  }
  
  if (emptySlot != -1) {
    memcpy(blockedTags[emptySlot].uid, uid, 8);
    blockedTags[emptySlot].expireTimeNFC1 = (durationNFC1 > 0) ? currentMillis + durationNFC1 : 0;
    blockedTags[emptySlot].expireTimeNFC2 = (durationNFC2 > 0) ? currentMillis + durationNFC2 : 0;
  }
}

// ==========================================
// [ Strict NDEF Read Logic ]
// ==========================================
String extractTagText(uint8_t *uid, PN5180ISO15693& reader) {
  String rawText = "";
  uint8_t readBuffer[4]; 
  bool foundTerminator = false;
  
  for (int b = 1; b < 12; b++) { 
    if (reader.readSingleBlock(uid, b, readBuffer, 4) != ISO15693_EC_OK) {
      return ""; 
    }
    
    for (int i = 0; i < 4; i++) {
      if (readBuffer[i] == 0xFE) { 
        foundTerminator = true;
        break; 
      }
      if (readBuffer[i] >= 32 && readBuffer[i] <= 126) {
        rawText += (char)readBuffer[i];
      }
    }
    if (foundTerminator) break;
  }
  
  if (!foundTerminator || rawText.length() == 0) {
    return "";
  }
  
  rawText.trim();
  return rawText;
}

// ==========================================
// [ MQTT Callback ]
// ==========================================
void callback(char* topic, byte* payload, unsigned int length) {
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, payload, length);
  if (error) return;

  const char* action = doc["action"];
  if (action == nullptr) return;
  
  if (strcmp(action, "response_feedback") == 0) {
    const char* status = doc["status"];
    const char* type = doc["type"];
    if (status == nullptr || type == nullptr) return;
    
    Serial.print(">>> [MQTT] Feedback Received - Type: ");
    Serial.print(type);
    Serial.print(" | Status: ");
    Serial.println(status);
    
    if (strcmp(status, "success") == 0) {
      if (strcmp(type, "login_scan") == 0 || strcmp(type, "gate_scan") == 0 || strcmp(type, "multiple_read") == 0) {
        startFeedback(FB_SUCCESS, 1);
      }
    } 
    else if (strcmp(status, "fail") == 0) {
      startFeedback(FB_FAIL, 3);
    }
  }
}

// ==========================================
// [ Setup ]
// ==========================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n\n>>> ESP32 Library Gate System Starting (Advanced Smart Blocking)...");
  
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  pinMode(LED_YELLOW, OUTPUT);
  digitalWrite(LED_YELLOW, LOW); 

  esp_task_wdt_config_t wdtConfig = {
    .timeout_ms = WDT_TIMEOUT_SEC * 1000,
    .idle_core_mask = 0,
    .trigger_panic = true
  };
  esp_task_wdt_init(&wdtConfig);
  esp_task_wdt_add(NULL);

  SPI.begin(SPI_SCK, SPI_MISO, SPI_MOSI, ETH_CS_PIN);
  Ethernet.init(ETH_CS_PIN);
  Ethernet.begin(mac, myIP, myDNS, myGateway, mySubnet);
  
  mqttClient.setServer(brokerIP, 1883);
  mqttClient.setCallback(callback);

  nfc1.begin(); nfc1.reset(); nfc1.setupRF();
  nfc2.begin(); nfc2.reset(); nfc2.setupRF();
  
  lastPN5180Maintenance = millis();
  Serial.println(">>> System Ready!\n");
}

// ==========================================
// [ Main Loop ]
// ==========================================
void loop() {
  unsigned long currentMillis = millis();
  esp_task_wdt_reset();

  if (!mqttClient.connected()) {
    if (currentMillis - lastReconnectAttempt > mqttReconnectDelay) {
      lastReconnectAttempt = currentMillis;
      Serial.print(">>> [MQTT] Attempting connection... (next retry in ");
      Serial.print(mqttReconnectDelay);
      Serial.println("ms)");
      
      if (mqttClient.connect("ESP32_Library_Gate", "kiosk/status", 0, true, "offline")) {
        Serial.println(">>> [MQTT] Connected to Broker!");
        mqttReconnectDelay = 5000; 
        mqttClient.subscribe(TOPIC_SUBSCRIBE);
        StaticJsonDocument<200> doc;
        doc["event"] = "device_status";
        doc["device_id"] = ESP_ID; 
        doc["mac_address"] = DEVICE_MAC_STR; 
        doc["status"] = "online";
        char buffer[200];
        serializeJson(doc, buffer);
        mqttClient.publish(TOPIC_PUBLISH, buffer); 
      } else {
        Serial.println(">>> [MQTT] Connection Failed!");
        mqttReconnectDelay = min(mqttReconnectDelay * 2, MQTT_RECONNECT_MAX_DELAY);
      }
    }
  } else {
    mqttClient.loop();
  }

  handleFeedback();

  if (currentMillis - lastPN5180Maintenance >= PN5180_MAINTENANCE_INTERVAL) {
    lastPN5180Maintenance = currentMillis;
    nfc1.reset(); nfc1.setupRF();
    nfc2.reset(); nfc2.setupRF();
  }

  if (currentMillis < globalScanCooldown) {
    return;
  }

  if (mqttClient.connected() && (currentMillis - lastNFCPoll >= NFC_POLL_INTERVAL)) {
    lastNFCPoll = currentMillis;
    uint8_t uid[8];
    char uidStr[24];

    // ========================================
    // NFC 1 Logic
    // ========================================
    if (nfc1.getInventory(uid) == ISO15693_EC_OK) {
      if (!isTagBlocked(uid, 1)) { 
        printUID(uid, uidStr);
        Serial.print("\n>>> [NFC1] Card Detected UID: ");
        Serial.println(uidStr);
        
        String rawData = extractTagText(uid, nfc1);
        int atIndex = rawData.indexOf('@');

        if (atIndex == -1 || rawData.length() == 0) {
          Serial.println(">>> [NFC1] FAIL! Invalid Format (No '@' found).");
          startFeedback(FB_FAIL, 3);
          blockTag(uid, 5000, 5000); 
          globalScanCooldown = currentMillis + SCAN_DELAY_MS; 
        } else {
          String validData = rawData.substring(atIndex);
          Serial.print(">>> [NFC1] Valid Card Data: ");
          Serial.println(validData);
          Serial.println(">>> [NFC1] SUCCESS! Card sent to Backend...");
          
          blockTag(uid, 60000, 5000); 
          
          StaticJsonDocument<256> doc;
          doc["event"] = "login_card_scan";
          doc["device_id"] = ESP_ID;
          doc["mac_address"] = DEVICE_MAC_STR;
          doc["status"] = "online";
          doc["uid"] = validData; 
          doc["hardware_mac"] = uidStr; 
          char buffer[256];
          serializeJson(doc, buffer);
          mqttClient.publish(TOPIC_PUBLISH, buffer);
          
          globalScanCooldown = currentMillis + SCAN_DELAY_MS; 
        }
      }
    }

    // ========================================
    // NFC 2 Logic 
    // ========================================
    int nfc2LoopGuard = 0;
    int validCardsFoundInNfc2 = 0;
    
    while (nfc2.getInventory(uid) == ISO15693_EC_OK && nfc2LoopGuard < MAX_NFC2_ITER && validCardsFoundInNfc2 < MAX_NFC2_READS) {
      nfc2LoopGuard++;
      esp_task_wdt_reset();
      mqttClient.loop();

      if (isTagBlocked(uid, 2)) {
        nfc2.stayQuiet(uid);
        continue; 
      }

      printUID(uid, uidStr);
      Serial.print("\n>>> [NFC2] Card Detected UID: ");
      Serial.println(uidStr);
      
      String rawData = extractTagText(uid, nfc2);
      int atIndex = rawData.indexOf('@');

      if (atIndex == -1 || rawData.length() == 0) {
        Serial.println(">>> [NFC2] FAIL! Invalid Format (No '@' found).");
        startFeedback(FB_FAIL, 3);
        blockTag(uid, 5000, 5000); 
        nfc2.stayQuiet(uid); 
        globalScanCooldown = millis() + SCAN_DELAY_MS; 
      } else {
        String validData = rawData.substring(atIndex);
        Serial.print(">>> [NFC2] Valid Card Data: ");
        Serial.println(validData);
        Serial.println(">>> [NFC2] SUCCESS! Card sent to Backend...");
        
        blockTag(uid, 5000, 60000); 
        
        StaticJsonDocument<256> doc;
        doc["event"] = "gate_scan";
        doc["uid"] = validData; 
        doc["device_id"] = ESP_ID;
        doc["mac_address"] = DEVICE_MAC_STR;
        doc["status"] = "online";
        doc["hardware_mac"] = uidStr; 
        char buffer[256];
        serializeJson(doc, buffer);
        mqttClient.publish(TOPIC_PUBLISH, buffer);
        
        nfc2.stayQuiet(uid); 
        validCardsFoundInNfc2++;
        globalScanCooldown = millis() + SCAN_DELAY_MS; 
      }
    }
  } 
}