// Mocks at the HTTP layer (nock) instead of the `request` module, so this suite
// runs unchanged before and after the request -> axios migration.

const nock = require('nock');
const Weather = require('../weather');

const API_HOST = 'http://api.openweathermap.org';

function createWeather(overrides) {
    const weather = Weather.create({});
    weather.isSimulated = function () {
        return false;
    };
    weather.configuration = Object.assign({
        cityName: 'Wiesbaden',
        countryCode: 'de',
        languageCode: 'de',
        units: 'metric',
        updateFrequencySeconds: 600,
        openWeatherMapKey: 'test-key'
    }, overrides);
    weather.configError = false;
    weather.state = {
        temperatureUnit: 'C',
        windSpeedUnit: 'mps',
        rainLast3h: 0,
        snowLast3h: 0
    };
    weather.publishStateChange = jest.fn();
    weather.publishOperationalStateChange = jest.fn();
    weather.logInfo = jest.fn();
    weather.logDebug = jest.fn();
    weather.logError = jest.fn();
    return weather;
}

const CURRENT_WEATHER_BODY = {
    cod: 200,
    id: 4004123,
    name: 'Wiesbaden',
    main: { temp: 18.5, pressure: 1013, humidity: 62 },
    weather: [{ main: 'Clouds', description: 'scattered clouds', icon: '03d' }],
    clouds: { all: 40 },
    wind: { speed: 3.6, deg: 220 },
    sys: { sunrise: 1700000000, sunset: 1700040000 },
    rain: { '3h': 0.5 },
    snow: { '3h': 0.2 }
};

const FORECAST_BODY = {
    cod: 200,
    list: [
        {
            dt: 1700000000,
            main: { temp: 12.3 },
            weather: [{ main: 'Rain' }],
            rain: { '3h': 1.2 },
            snow: { '3h': 0.0 }
        },
        {
            dt: 1700010800,
            main: { temp: 10.1 },
            weather: [{ main: 'Clear' }]
            // rain/snow keys intentionally absent
        }
    ]
};

beforeEach(() => {
    nock.cleanAll();
});

afterAll(() => {
    nock.restore();
});

describe('getWeather', () => {
    test('happy path populates state from a realistic response body', async () => {
        nock(API_HOST).get('/data/2.5/weather').query(true).reply(200, CURRENT_WEATHER_BODY);
        const weather = createWeather();

        await weather.getWeather();

        expect(weather.state).toEqual({
            temperatureUnit: 'C',
            temperature: 18.5,
            barometricPressure: 1013,
            humidity: 62,
            weatherMain: 'Clouds',
            weatherDescription: 'scattered clouds',
            weatherIconURL: 'http://openweathermap.org/img/w/03d.png',
            cityId: 4004123,
            cityName: 'Wiesbaden',
            clouds: 40,
            windSpeed: 3.6,
            windSpeedUnit: 'mps',
            windDirection: 220,
            sunrise: new Date(1700000000 * 1000),
            sunset: new Date(1700040000 * 1000),
            rainLast3h: 0.5,
            snowLast3h: 0.2
        });
        expect(weather.publishStateChange).toHaveBeenCalledTimes(1);
    });

    test('missing top-level rain/snow keys leave rainLast3h/snowLast3h unset', async () => {
        const body = Object.assign({}, CURRENT_WEATHER_BODY);
        delete body.rain;
        delete body.snow;
        nock(API_HOST).get('/data/2.5/weather').query(true).reply(200, body);
        const weather = createWeather();

        await weather.getWeather();

        expect(weather.state.rainLast3h).toBeUndefined();
        expect(weather.state.snowLast3h).toBeUndefined();
    });

    test('network error rejects the promise', async () => {
        nock(API_HOST).get('/data/2.5/weather').query(true).replyWithError('ECONNREFUSED');
        const weather = createWeather();

        await expect(weather.getWeather()).rejects.toBeTruthy();
    });

    test('non-200 cod rejects with the cod/message-derived string', async () => {
        nock(API_HOST).get('/data/2.5/weather').query(true)
            .reply(200, { cod: 401, message: 'Invalid API key' });
        const weather = createWeather();

        await expect(weather.getWeather()).rejects.toBe(
            'Could not get weather. Error code 401 with message "Invalid API key".'
        );
    });

    test('malformed body rejects the promise', async () => {
        nock(API_HOST).get('/data/2.5/weather').query(true).reply(200, 'not json');
        const weather = createWeather();

        await expect(weather.getWeather()).rejects.toBeTruthy();
    });
});

describe('getForecast', () => {
    test('happy path populates forecast arrays, defaulting missing rain/snow to 0', async () => {
        nock(API_HOST).get('/data/2.5/forecast').query(true).reply(200, FORECAST_BODY);
        const weather = createWeather();

        await weather.getForecast();

        expect(weather.state.forecastTimestamp).toEqual([
            new Date(1700000000 * 1000),
            new Date(1700010800 * 1000)
        ]);
        expect(weather.state.forecastTemperature).toEqual([12.3, 10.1]);
        expect(weather.state.forecastWeatherMain).toEqual(['Rain', 'Clear']);
        expect(weather.state.forecastRain).toEqual([1.2, 0]);
        expect(weather.state.forecastSnow).toEqual([0, 0]);
        expect(weather.publishStateChange).toHaveBeenCalledTimes(1);
    });

    test('network error rejects the promise', async () => {
        nock(API_HOST).get('/data/2.5/forecast').query(true).replyWithError('ECONNREFUSED');
        const weather = createWeather();

        await expect(weather.getForecast()).rejects.toBeTruthy();
    });

    test('non-200 cod rejects with the cod/message-derived string', async () => {
        nock(API_HOST).get('/data/2.5/forecast').query(true)
            .reply(200, { cod: 401, message: 'Invalid API key' });
        const weather = createWeather();

        await expect(weather.getForecast()).rejects.toBe(
            'Could not get weather forecast. Error code 401 with message "Invalid API key".'
        );
    });

    test('malformed body rejects the promise', async () => {
        nock(API_HOST).get('/data/2.5/forecast').query(true).reply(200, 'not json');
        const weather = createWeather();

        await expect(weather.getForecast()).rejects.toBeTruthy();
    });
});