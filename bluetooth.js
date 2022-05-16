// Получение ссылок на элементы UI
let connectButton = document.getElementById('connectBLE');
// let disconnectButton = document.getElementById('disconnectBLE');
// let terminalContainer = document.getElementById('terminal');
// let sendForm = document.getElementById('send-form');
// let inputField = document.getElementById('input');
// let logContainer = document.getElementById('log');
var isConnect = false;

// Подключение к устройству при нажатии на кнопку Connect
connectButton.addEventListener('click', function () {
  if (isConnect)
    disconnect();
  else
    connect();

});

// // Отключение от устройства при нажатии на кнопку Disconnect
// disconnectButton.addEventListener('click', function () {
//   disconnect();
//   StateConnect(false);
// });

// // Обработка события отправки формы
// sendForm.addEventListener('submit', function (event) {
//   event.preventDefault(); // Предотвратить отправку формы
//   send(inputField.value); // Отправить содержимое текстового поля
//   inputField.value = '';  // Обнулить текстовое поле
//   inputField.focus();     // Вернуть фокус на текстовое поле
// });

// Кэш объекта выбранного устройства
let deviceCache = null;

// Кэш объекта характеристики
let characteristicCache = null;

// Промежуточный буфер для входящих данных
let readBuffer = '';

// function connectAll() {
//   console.log('Requesting Bluetooth Device...');
//   navigator.bluetooth.requestDevice(
//       {
//         acceptAllDevices: true,
//       })
//       .then(device => {
//           console.log('> Found ' + device.name);
//           console.log('Connecting to GATT Server...');
//           return device.gatt.connect();
//       })
//       .catch(error => {
//           console.log('Argh! ' + error);
//       });
// }

// Запустить выбор Bluetooth устройства и подключиться к выбранному
function connect() {
  return (deviceCache ? Promise.resolve(deviceCache) :
    requestBluetoothDevice()).
    then(device => connectDeviceAndCacheCharacteristic(device)).
    then(characteristic => startNotifications(characteristic)).
    catch(error => log(error));
}

// Запрос выбора Bluetooth устройства
function requestBluetoothDevice() {
  log('Requesting bluetooth device...');

  return navigator.bluetooth.requestDevice({
    //filters: [{ services: [0xFFE0] }],
    acceptAllDevices: true,
    optionalServices: [0xFFE0]
  }).
    then(device => {
      log('"' + device.name + '" bluetooth device selected');
      deviceCache = device;
      deviceCache.addEventListener('gattserverdisconnected',
        handleDisconnection);

      return deviceCache;
    });
}

// Обработчик разъединения
function handleDisconnection(event) {
  let device = event.target;
  StateConnect(false);
  isConnect = false;
  log('"' + device.name +
    '" bluetooth device disconnected, trying to reconnect...');

  connectDeviceAndCacheCharacteristic(device).
    then(characteristic => startNotifications(characteristic)).
    catch(error => log(error));
}

// Подключение к определенному устройству, получение сервиса и характеристики
function connectDeviceAndCacheCharacteristic(device) {
  if (device.gatt.connected && characteristicCache) {
    return Promise.resolve(characteristicCache);
  }

  log('Connecting to GATT server...');

  return device.gatt.connect().
    then(server => {
      log('GATT server connected, getting service...');

      return server.getPrimaryService(0xFFE0);
    }).
    then(service => {
      log('Service found, getting characteristic...');

      return service.getCharacteristic(0xFFE1);//0xFFE2
    }).
    then(characteristic => {
      log('Characteristic found');
      characteristicCache = characteristic;

      return characteristicCache;
    });
}

// Включение получения уведомлений об изменении характеристики
function startNotifications(characteristic) {
  log('Starting notifications...');

  return characteristic.startNotifications().
    then(() => {
      log('Notifications started');
      StateConnect(true);
      isConnect = true;
      characteristic.addEventListener('characteristicvaluechanged',
        handleCharacteristicValueChanged);
    });
}



// Получение данных
function handleCharacteristicValueChanged(event) {
  let value = new TextDecoder('windows-1251').decode(event.target.value);

  for (let c of value) {
    if (c === '\n') {
      let data = readBuffer.trim();
      readBuffer = '';

      if (data) {
        // receive(data);
        receiveData(data);
      }
      if (timerBusy != null) {
        isBusy = false;
        clearTimeout(timerBusy);
        timerBusy != null;
        if (arrSend.length)
          dataTransfer();
      }
    }
    else {
      readBuffer += c;
    }
  }
}

// Обработка полученных данных
function receive(data) {
  var dat = 'RX: ' + data;
  log(dat, 'in');
}

// Вывод в терминал
//function log(data, type = '') {
  // terminalContainer.insertAdjacentHTML('beforeend',
  //   '<div' + (type ? ' class="' + type + '"' : '') + '>' + data + '</div>');
  // terminalContainer.scrollTop = terminalContainer.scrollHeight;
  // let el = terminalContainer.querySelectorAll('div');
  // if (el.length > 20)
  //   el[0].remove();
//}

// Отключиться от подключенного устройства
function disconnect() {
  if (deviceCache) {
    log('Disconnecting from "' + deviceCache.name + '" bluetooth device...');
    deviceCache.removeEventListener('gattserverdisconnected',
      handleDisconnection);

    if (deviceCache.gatt.connected) {
      deviceCache.gatt.disconnect();
      log('"' + deviceCache.name + '" bluetooth device disconnected');
    }
    else {
      log('"' + deviceCache.name +
        '" bluetooth device is already disconnected');
    }
  }

  if (characteristicCache) {
    characteristicCache.removeEventListener('characteristicvaluechanged',
      handleCharacteristicValueChanged);
    characteristicCache = null;
  }

  deviceCache = null;
  isConnect=false;
  StateConnect(false);
}

var arrSend = [];
var isBusy = false;
var timerBusy = null;

function dataTransfer() {
  if (isBusy)
    return;
  if (arrSend.length) {
    var data = arrSend.shift();
    if (data.length > 20) {
      let chunks = data.match(/(.|[\r\n]){1,20}/g);

      writeToCharacteristic(characteristicCache, chunks[0]);

      for (let i = 1; i < chunks.length; i++) {
        setTimeout(() => {
          writeToCharacteristic(characteristicCache, chunks[i]);
        }, i * 300);
      }
    }
    else {
      writeToCharacteristic(characteristicCache, data);
    }
    // var dat = 'TX: ' + data;
    // log(dat, 'out');
    isBusy = true;
    timerBusy = setTimeout(() => {
      isBusy = false;
      if (arrSend.length)
        dataTransfer();
    }, 1000);
  }
}

function log(data){
  console.log(data);
}

// Отправить данные подключенному устройству
function send(data) {
  data = String(data);

  if (!data || !characteristicCache) {
    return;
  }
  data += '\r';
  data += '\n';
  arrSend.push(data);
  dataTransfer();
  // var bf= new Uint8Array(3);
  // bf[0]=0xe9;
  // bf[1]=0x01;
  // bf[2]=0x04;
  // writeToCharacteristicValue(characteristicCache,bf);
}

function writeToCharacteristicValue(characteristic, data) {
  characteristic.writeValue(data);
}

// Записать значение в характеристику
function writeToCharacteristic(characteristic, data) {
  characteristic.writeValue(new TextEncoder().encode(data));
}
