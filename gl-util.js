"use strict";

const enumNameCache = new Map();

export function getEnumName(gl, enumValue) {
    if (!enumNameCache.has(enumValue)) {
        enumNameCache.set(enumValue, Object.getOwnPropertyNames(gl).find(propName => gl[propName] === enumValue));
    }
    return enumNameCache.get(enumValue);
}

export function compileShader(gl, shaderType, source) {
    const shader = gl.createShader(shaderType);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
        const infoLog = gl.getShaderInfoLog(shader);
        console.error(`Error compiling shader ‘${shader}’:\n${infoLog}`);
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}


export function createProgram(gl, shaders) {
    const program = gl.createProgram();
    shaders.forEach(shader => gl.attachShader(program, shader));
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
        const infoLog = gl.getProgramInfoLog(program);
        console.error(`Error linking program:\n${infoLog}`);
        gl.deleteProgram(program);
        return null;
    }
    return program;
}


export function getAttributeLocations(gl, program) {
    const attributeLocations = {};
    const n = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);

    for (let i = 0; i < n; i++) {
        let { name = "" } = gl.getActiveAttrib(program, i) || {};
        const location = gl.getAttribLocation(program, name);
        if (name.substr(0, 2) === "a_") {
            name = name.substr(2);
        }
        attributeLocations[name] = location;
    }

    return attributeLocations;
}


export function createTexture({ gl, width, height, data = null, format = gl.RGBA, internalFormat, type = gl.UNSIGNED_BYTE }) {
    internalFormat = internalFormat || format;

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, data);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    return texture;
}


export function getUniforms(gl, program) {
    const uniforms = {};
    const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);

    let textureUnit = 0;

    function getTextureSetter(gl, program, bindPoint, location, unit) {
        console.log(unit);
        return (texture) => {
            gl.uniform1i(location, unit);
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(bindPoint, texture);
        }
    }

    for (let i = 0; i < n; i++) {
        let { name, type } = gl.getActiveUniform(program, i) || {};
        const location = gl.getUniformLocation(program, name);
        if (name.substr(-3) === "[0]") {
            name = name.substr(0, name.length - 3);
        }
        if (name.substr(0, 2) === "u_") {
            name = name.substr(2);
        }
        let setter = {
            [gl.FLOAT]: v => typeof v === "number" ? gl.uniform1f(location, v) : gl.uniform1fv(location, v),
            [gl.FLOAT_VEC2]: v => gl.uniform2f(location, ...v),
            [gl.FLOAT_VEC3]: v => gl.uniform3f(location, ...v),
            [gl.FLOAT_VEC4]: v => gl.uniform4f(location, ...v),

            [gl.INT]: v => typeof v === "number" ? gl.uniform1i(location, v) : gl.uniform1iv(location, v),
            [gl.INT_VEC2]: v => gl.uniform2i(location, ...v),
            [gl.INT_VEC3]: v => gl.uniform3i(location, ...v),
            [gl.INT_VEC4]: v => gl.uniform4i(location, ...v),

            [gl.BOOL]: v => typeof v === "number" ? gl.uniform1i(location, v) : gl.uniform1iv(location, v),
            [gl.BOOL_VEC2]: v => gl.uniform2i(location, ...v),
            [gl.BOOL_VEC3]: v => gl.uniform3i(location, ...v),
            [gl.BOOL_VEC4]: v => gl.uniform4i(location, ...v),

            [gl.FLOAT_MAT2]: v => gl.uniformMatrix2fv(location, false, v),
            [gl.FLOAT_MAT3]: v => gl.uniformMatrix3fv(location, false, v),
            [gl.FLOAT_MAT4]: v => gl.uniformMatrix4fv(location, false, v),

            //[gl.SAMPLER_2D]: v => gl.uniform1i(location, v),
        }[type];

        if (!setter) {
            let samplerBindPoint;
            if ([gl.SAMPLER_2D, gl.UNSIGNED_INT_SAMPLER_2D].includes(type)) {
                samplerBindPoint = gl.TEXTURE_2D;
            } else if ([gl.SAMPLER_CUBE].includes(type)) {
                samplerBindPoint = gl.TEXTURE_CUBE_MAP;
            }
            if (!!samplerBindPoint) {
                const textureSetter = getTextureSetter(gl, program, samplerBindPoint, location, textureUnit);
                setter = v => textureSetter(v);
                textureUnit++;
            }
        }

        if (!setter) {
            throw Error(`No getter found for uniform ‘${name}’, type 0x${type.toString(16)}.`);
        }

        const getter = () => gl.getUniform(program, location);

        try {
            Object.defineProperty(uniforms, name, { set: setter, get: getter });
        } catch (e) {
            console.error("Context lost:", gl.isContextLost(), "Error:", e);
        }
    }
    return uniforms;
}
