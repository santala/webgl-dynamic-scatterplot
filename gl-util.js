"use strict";

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

    return Object.freeze(attributeLocations);
}

export function getUniforms(gl, program) {
    const uniforms = {};
    const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);

    try {
        for (let i = 0; i < n; i++) {
            let { name, type } = gl.getActiveUniform(program, i) || {};
            const location = gl.getUniformLocation(program, name);
            if (name.substr(-3) === "[0]") {
                name = name.substr(0, name.length - 3);
            }
            if (name.substr(0, 2) === "u_") {
                name = name.substr(2);
            }
            const setter = {
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
            }[type];
            const getter = () => gl.getUniform(program, location);

            Object.defineProperty(uniforms, name, { set: setter, get: getter });
        }
    } catch (e) {
        console.error("Context lost:", gl.isContextLost(), "Error:", e);
    }
    return Object.freeze(uniforms);
}


export function createUniformSetters(gl, program) {
    let textureUnit = 0;

    /**
     * Creates a setter for a uniform of the given program with it's
     * location embedded in the setter.
     * @param {WebGLProgram} program
     * @param {WebGLUniformInfo} uniformInfo
     * @returns {function} the created setter.
     */
    function createUniformSetter(program, uniformInfo) {
        const location = gl.getUniformLocation(program, uniformInfo.name);
        const type = uniformInfo.type;
        // Check if this uniform is an array
        const isArray = (uniformInfo.size > 1 && uniformInfo.name.substr(-3) === '[0]');




        if ((type === gl.SAMPLER_2D || type === gl.SAMPLER_CUBE) && isArray) {
            const units = [];
            for (let ii = 0; ii < info.size; ++ii) {
                units.push(textureUnit++);
            }
            return function(bindPoint, units) {
                return function(textures) {
                    gl.uniform1iv(location, units);
                    textures.forEach(function(texture, index) {
                        gl.activeTexture(gl.TEXTURE0 + units[index]);
                        gl.bindTexture(bindPoint, texture);
                    });
                };
            }(getBindPointForSamplerType(gl, type), units);
        }
        if (type === gl.SAMPLER_2D || type === gl.SAMPLER_CUBE) {
            return function(bindPoint, unit) {
                return function(texture) {
                    gl.uniform1i(location, unit);
                    gl.activeTexture(gl.TEXTURE0 + unit);
                    gl.bindTexture(bindPoint, texture);
                };
            }(getBindPointForSamplerType(gl, type), textureUnit++);
        }
        throw ('unknown type: 0x' + type.toString(16)); // we should never get here.
    }

    const uniformSetters = { };
    const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);

    for (let ii = 0; ii < numUniforms; ++ii) {
        const uniformInfo = gl.getActiveUniform(program, ii);
        if (!uniformInfo) {
            break;
        }
        let name = uniformInfo.name;
        // remove the array suffix.
        if (name.substr(-3) === '[0]') {
            name = name.substr(0, name.length - 3);
        }
        const setter = createUniformSetter(program, uniformInfo);
        uniformSetters[name] = setter;
    }
    return uniformSetters;
}
