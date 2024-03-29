const EventEmitter = require('events');
const Redis = require('ioredis');
const genericPool = require('generic-pool');

const defaultPool = {
    min: 2,
    max: 10
};

class RedisPool extends EventEmitter {

    // 绑定ioredis事件，提供上层服务
    constructor(options) {
        super();

        const {
            redis,
            pool
        } = options;

        let connectedCount = 1;
        let readyCount = 1;


        const factory = {
            create: () => new Promise((resolve, reject) => {
                const ioredis = new Redis(redis);
                ioredis
                    .on('error', (e) => {
                        this.logger.error('ioredis error', e);
                        this.emit('error', e, ioredis);
                        reject(e);
                    })
                    .on('connect', () => {
                        this.logger.info('connected to redis with ioredis', 'thread:' , connectedCount++);
                        this.emit('connect', ioredis);
                    })
                    .on('ready', () => {
                        this.logger.info('ready for all redis connections', 'thread:' , readyCount++);
                        this.emit('ready', ioredis);
                        resolve(ioredis);
                    })
                    .on('reconnecting', () => {
                        this.logger.info('reconnected to redis with ioredis');
                        this.emit('reconnecting', ioredis);
                    });
            }),
            destroy: ioredis => new Promise((resolve) => {
                ioredis
                    .on('close', (e) => {
                        if (e) {
                            this.logger.error('close an ioredis connection error, cause: ', e);
                        } else {
                            this.logger.info('closed an ioredis connection');
                        }
                        this.emit('close', ioredis, e);
                        resolve(ioredis);
                    })
                    .on('end', (e) => {
                        if (e) {
                            this.logger.error('end an ioredis connections error, cause: ', e);
                        } else {
                            this.logger.info('ended an ioredis connections');
                        }
                        this.emit('end', ioredis, e);
                        resolve(ioredis);
                    })
                    .disconnect();
            })
        };

        this.logger = console;
        this.options = options;
        this.pool = genericPool.createPool(factory, Object.assign({}, defaultPool, pool));
    }

    getConnection(priority) {
        return this.pool.acquire(priority);
    }

    release(client) {
        return this.pool.release(client);
    }

    destroy(client) {
        return this.pool.destroy(client);
    }

    end() {
        return this.pool.drain()
            .then(() => this.pool.clear())
            .then((res) => {
                this.logger.info('ended all ioredis connections');
                this.emit('disconnected');
                return res;
            });
    }

    disconnect() {
        return this.end();
    }

}

RedisPool.Redis = Redis;

module.exports = RedisPool;