const io = require('socket.io');
const forge = require('node-forge');
const bigInt = require("big-integer");

const server = io.listen(8000);

let session_keys = [];

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

// let p_big;
// let q_big;
let n_big;

(async() => {

    console.log('сервер запущен :^)');

    let p = await getPrime(16);
    let q = await getPrime(16);

    let p_big = bigInt(p.toString(16), 16);
    let q_big = bigInt(q.toString(16), 16);
    console.log('p', p_big);
    console.log('q', q_big);

    n_big = p_big.multiply(q_big);
    console.log('n', n_big);

    server.on('connection', function (socket) {

        console.log('у нас новенький:', socket.id);

        // socket.to(socket_to).emit('get_n', {
        socket.emit('get_n', {
            'n': n_big
        });
        console.log('отправим ему n');

        // socket.emit('gen_keys');

        socket.on('send', function (data) {

            let item = {
                'from': socket.id,
                'to': data.to,
                'message': data.message,
                'v': data.v,
                'x': data.x,
                'iter': data.iter,
            };

            console.log('передача сообщения от', socket.id, 'для', data.to);
            // console.log(item);

            socket.to(data.to).emit('message', item);

        });

        socket.on('create_y_from_e', function (data) {
            let item = {
                'from': socket.id,
                'to': data.to,
                'e': data.e,
                'v': data.v,
                'x': data.x,
                'iter': data.iter,
            };
            console.log('запрос на создание Y от', socket.id, 'для', data.to);

            socket.to(data.to).emit('create_y_from_e', item);
        });


        socket.on('create_yvx_from_e', function (data) {

            // console.log('create_yvx_from_e');
            // console.log(data);

            let item = {
                'from': socket.id,
                'to': data.to,
                'e': data.e,
                'iter': data.iter,
            };
            console.log('запрос на создание Y от', socket.id, 'для', data.to);

            socket.to(data.to).emit('create_yvx_from_e', item);
        });

        socket.on('verify_y_from_e', function (data) {
            let item = {
                'from': socket.id,
                'to': data.to,
                'e': data.e,
                'y': data.y,
                'v': data.v,
                'x': data.x,
                'iter': data.iter,
            };
            console.log('раунд #' + data.iter + ' ответ для проверки Y от', socket.id, 'для', data.to);

            socket.to(data.to).emit('verify_y_from_e', item);
        });

        socket.on('publish_public_data', function (data) {
            console.log(socket.id, 'опубликовал свои публичные данные:');
            console.log('открытый ключ (' + data.v + ')');

            let info = {
                'socket_id': socket.id,
                'v': data.v,
            };
            session_keys.push(info);

            // Обновить открытую информацию о пользователях в чате
            server.sockets.emit('public', session_keys);
        });

        socket.on('disconnect', (reason) => {
            console.log('пользователь', socket.id, 'вышел');
            let new_session_keys = [];
            for (let i = 0; i < session_keys.length; i++) {
                if (session_keys[i].socket_id !== socket.id) {
                    new_session_keys.push(session_keys[i]);
                }
            }
            session_keys = new_session_keys;

            // Обновить открытую информацию о пользователях в чате
            server.sockets.emit('public', session_keys);
        });

    });
})();