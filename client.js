const readline = require('readline'),
    io = require('socket.io-client'),
    forge = require('node-forge'),
    bigInt = require("big-integer");

async function getPrime(bits)
{
    return await new Promise((resolve, reject) => {
        return forge.prime.generateProbablePrime(bits, function (err, num) {
            if (err) {
                reject(err)
            } else {
                resolve(num)
            }
        });
    })
}

let s_big; // считается при запуске один раз
let v_big; // считается при запуске один раз
let n_big; // от сервера
let r_big; // случайное значение итерации

let ioClient = io.connect('http://localhost:8000');
let rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let session_keys = [];

async function genX() {
    let r = await getPrime(29); // Чтобы точно было меньше n
    r_big = bigInt(r.toString(16), 16);
    console.log('выбираем случайное число r', r_big);
    let x_big = r_big.modPow(2n, n_big);
    console.log('считаем и отсылаем x', x_big, '(доказательство)');
    return x_big;
}

function genE() {
    return Math.round(Math.random());
}

function genY(e) {
    let y_big;
    // console.log('genY r_big');
    // console.log(r_big);
    // console.log('genY e');
    // console.log(e);
    if (e == 0) {
        y_big = r_big;
    } else {
        y_big = r_big.multiply(s_big).mod(n_big);
    }
    // console.log('тогда y', y_big);
    return y_big;
}

function checkY(e, y_big, x_big, v_sender) {
    e = bigInt(e);
    y_big = bigInt(y_big);
    x_big = bigInt(x_big);
    v_sender = bigInt(v_sender);

    if (y_big === 0n) {
        return true;
    } else {

        let left = y_big.modPow(2, n_big);
        let right = v_sender.pow(e).multiply(x_big).mod(n_big);

        // console.log('left', left);
        // console.log('right', right);

        if (left.equals(right)) {
            return true;
        } else {
            return false;
        }
    }
}

rl.on('line', async function (msg) {
    for (let i = 0; i < session_keys.length; i++) {

        let user = session_keys[i];

        // Чтобы не отправлять сообщение самому себе
        if (user.socket_id !== ioClient.id) {

            let x_iter = await genX();

            // console.log('V и X отправителя');
            // console.log({
            //     'to': user.socket_id,
            //     'message': msg,
            //     'v': v_big,
            //     'x': x_iter,
            // });

            ioClient.emit('send', {
                'to': user.socket_id,
                'message': msg,
                'v': v_big,
                'x': x_iter,
                'iter': 1,
            });

            console.log('собщение было отправлено ' + user.socket_id);
        }
    }

    rl.prompt(true);
});

ioClient.on('message', function (data) {

    // console.log('message data');
    // console.log(data);

    for (let i = 0; i < session_keys.length; i++) {

        let user = session_keys[i];
        let user_socket_id = user.socket_id;

        if (user_socket_id === data.from) {

            let message = data.message;
            let v_sender = data.v;
            let x_iter = data.x;

            console_out('было получено сообщение "' + message + '" от ' + data.from + ' v = ' + v_sender + ', x = ' + x_iter);

            let e_iter = genE();
            // console.log('e_iter');
            // console.log(e_iter);
            console.log('выбираем проверочный бит e =', e_iter);

            ioClient.emit('create_y_from_e', {
                'to': user.socket_id,
                'e': e_iter,
                'v': v_sender,
                'x': x_iter,
                'iter': data.iter,
            });
        }
    }
});



ioClient.on('create_y_from_e', function (data) {

    // console.log('create_y_from_e');
    // console.log(data);

    let from = data.from;
    let e_iter = data.e;
    let v_iter = data.v;
    let x_iter = data.x;

    let y_iter = genY(e_iter);
    // console.log('y_iter');
    // console.log(y_iter);
    console.log('вычисляем y =', y_iter);

    ioClient.emit('verify_y_from_e', {
        'to': from,
        'e': e_iter,
        'y': y_iter,
        'v': v_iter,
        'x': x_iter,
        'iter': data.iter,
    });
});

ioClient.on('create_yvx_from_e', async function (data) {

    // console.log('YVX create_yvx_from_e');
    // console.log(data);

    let iter = data.iter;
    let from = data.from;
    let e_iter = data.e;
    let x_iter = await genX();

    let y_iter = genY(e_iter);
    // console.log('y_iter');
    // console.log(y_iter);
    console.log('раунд #', iter);

    console.log('вычисляем y =', y_iter);

    ioClient.emit('verify_y_from_e', {
        'to': from,
        'e': e_iter,
        'y': y_iter,
        'v': v_big,
        'x': x_iter,
        'iter': iter,
    });
});

ioClient.on('verify_y_from_e', function (data) {
    // console.log('verify_y_from_e');
    // console.log(data);

    let result = checkY(data.e, data.y, data.x, data.v);

    if (result) {
        console.log('проверка Y раунда #' + data.iter + ' от ' + data.from + ' закончилась успешно');

        if (data.iter < 20) {
            ioClient.emit('create_yvx_from_e', {
                'to': data.from,
                'e': genE(),
                'iter': data.iter + 1,
            });
        } else {
            console.log('было выполненно достаточно проверок');
        }

    } else {
        console.log('проверка Y закончилась ошибкой');
    }
});

ioClient.on('get_n', async function (data) {

    console.log('get_n');
    console.log(data);
    n_big = bigInt(data.n);

    console.log('сеерверное n =', n_big);

    let s = await getPrime(29); // Чтобы точно было меньше n
    s_big = bigInt(s.toString(16), 16);
    console.log('s', s_big);
    v_big = s_big.modPow(2n, n_big);
    console.log('v (открытый ключ A)', v_big);

    ioClient.emit('publish_public_data', { v: v_big });

});

ioClient.on('public', function (data) {

    session_keys = data;

    // console_out('public');
    console_out('в комнате ' + session_keys.length + ' человек(а)');
});

function console_out(msg) {
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    console.log(msg);
    rl.prompt(true);
}

