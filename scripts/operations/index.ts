import * as readline from 'readline';
import hre, { ethers } from 'hardhat';
import { toBN } from '../util/web3utils';
import inquirer from 'inquirer';
import * as dotenv from 'dotenv';
import chalk from 'chalk';
import * as fs from 'fs-extra';
import { DeployedContracts } from '../deploy';
import { Signer } from 'ethers';
import { LiquidityCertificate } from '../../typechain-types';
import { calculateGasLimitAndGasPrice } from '../util/overrideProvider';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function question(query: string) {
    return new Promise((resolve) =>
        rl.question(query, (answ) => resolve(answ)),
    );
}

function operation(query: string) {
    return new Promise((resolve) =>
        rl.question(query, (answ) => resolve(answ)),
    );
}

function send(method: string, params?: Array<any>) {
    return hre.ethers.provider.send(method, params === undefined ? [] : params);
}

function mineBlock() {
    return send('evm_mine', []);
}

async function fastForward(seconds: number) {
    const method = 'evm_increaseTime';
    const params = [seconds];
    await send(method, params);
    await mineBlock();
}

async function currentTime() {
    const { timestamp } = await ethers.provider.getBlock('latest');
    return timestamp;
}

async function availableAddresses() {
    const signers = await hre.ethers.getSigners();
    const addresses = [];
    for (let i = 0; i < signers.length; i++) {
        addresses.push(await signers[i].getAddress());
    }
    return addresses;
}

async function getCurrentSignerAvailableCertificates(
    liquidityCertificate: LiquidityCertificate,
    currentSigner: Signer,
) {
    const currentSignerAvailableCertificates = [];
    const allSignerCertificates =
        await liquidityCertificate.getLiquidityProviders(
            await currentSigner.getAddress(),
        );
    for (let i = 0; i < allSignerCertificates.length; i++) {
        const certificateInfo = await liquidityCertificate.getCertificateInfo(
            allSignerCertificates[i],
        );
        if (certificateInfo.isValid) {
            currentSignerAvailableCertificates.push(
                String(allSignerCertificates[i]),
            );
        }
    }
    return currentSignerAvailableCertificates;
}

async function main() {
    const prompt = inquirer.createPromptModule();
    let res: DeployedContracts = {} as DeployedContracts;
    if (
        fs.existsSync(
            './deployments/.env.' + String(hre.network.name) + '.json',
        )
    ) {
        res = JSON.parse(
            fs.readFileSync(
                './deployments/.env.' + String(hre.network.name) + '.json',
                'utf8',
            ),
        );
    } else {
        throw new Error('No .env.json file found');
    }
    const markets = [];
    let marketIndex = 0;
    for (let i = 0; i < res.markets.length; i++) {
        markets.push(res.markets[i].marketName);
    }
    const chooseMarkets = await prompt({
        type: 'list',
        name: 'marketName',
        message: 'Which market you want to choose:)',
        choices: markets,
    });

    for (let i = 0; i < res.markets.length; i++) {
        if (res.markets[i].marketName == chooseMarkets.marketName) {
            marketIndex = i;
            break;
        }
    }

    const gasLimitAndGasPrice =
        hre.network.name ==
        ('mandala' || hre.network.name == 'mandala_localhost')
            ? await calculateGasLimitAndGasPrice()
            : {};
    const signers = await hre.ethers.getSigners();
    const _metaDefender = await hre.ethers.getContractFactory('MetaDefender');
    const metaDefender = await _metaDefender.attach(
        res.markets[marketIndex].metaDefender,
    );

    const _liquidityCertificate = await hre.ethers.getContractFactory(
        'LiquidityCertificate',
    );
    const liquidityCertificate = await _liquidityCertificate.attach(
        res.markets[marketIndex].liquidityCertificate,
    );

    const _policy = await hre.ethers.getContractFactory('Policy');
    const policy = await _policy.attach(res.markets[marketIndex].policy);

    const _quoteToken = await hre.ethers.getContractFactory('TestERC20');
    const quoteToken = await _quoteToken.attach(res.testERC20);

    const _metaDefenderMarketsRegistry = await hre.ethers.getContractFactory(
        'MetaDefenderMarketsRegistry',
    );
    const marketRegistry = await _metaDefenderMarketsRegistry.attach(
        res.metaDefenderMarketsRegistry,
    );

    const _globalsViewer = await hre.ethers.getContractFactory('GlobalsViewer');
    const globalsViewer = await _globalsViewer.attach(res.globalsViewer);

    let currentSigner = await signers[0];
    const choices = [
        'Get Rewards',
        'Claim Rewards',
        'Provide Liquidity',
        'Liquidity Withdraw',
        'Buy Policy',
        'Settle Policy',
        'Query My Account',
        'Query Insurance Price',
        'Query Global Views',
        'Calculate Premium',
        'Register Market',
        'Query Market Addresses',
        'Time Travel',
        'Give Me Some Test Token',
        'Approve',
        'Transfer',
        'My Address',
        'Choose Address',
        'Add Market',
        'Remove Market',
        'Exit',
    ];

    const markets_available = await marketRegistry.getInsuranceMarkets();

    while (true) {
        const answers = await prompt({
            type: 'list',
            name: 'operation',
            message: 'What do you want to do?',
            choices,
        });
        switch (answers.operation) {
            case 'Query Market Addresses':
                console.log(markets_available);
                break;
            case 'Remove Market':
                const markets = await prompt({
                    type: 'list',
                    name: 'name',
                    message: 'Which markets you want to remove:)',
                    choices: markets_available[1],
                });
                for (let i = 0; i < markets_available[1].length; i++) {
                    if (markets_available[1][i] == markets.name) {
                        await marketRegistry.removeMarket(
                            markets_available[0][i],
                            gasLimitAndGasPrice,
                        );
                        break;
                    }
                }
                break;
            case 'Claim Rewards':
                const csac_claim_rewards =
                    await getCurrentSignerAvailableCertificates(
                        liquidityCertificate,
                        currentSigner,
                    );
                const claim_rewards = await prompt({
                    type: 'list',
                    name: 'certificateId',
                    message: 'Which certificate you want to claim rewards:)',
                    choices: csac_claim_rewards,
                });
                await metaDefender.claimRewards(
                    claim_rewards.certificateId,
                    gasLimitAndGasPrice,
                );
                break;
            case 'Get Rewards':
                const csac_get_rewards =
                    await getCurrentSignerAvailableCertificates(
                        liquidityCertificate,
                        currentSigner,
                    );
                const get_rewards = await prompt({
                    type: 'list',
                    name: 'certificateId',
                    message: 'Which certificate you want to get rewards:)',
                    choices: csac_get_rewards,
                });
                const rewards = await metaDefender.getRewards(
                    get_rewards.certificateId,
                    false,
                );
                console.log('rewards is ', rewards);
                break;
            case 'Transfer':
                const transferQuery = await prompt([
                    {
                        type: 'input',
                        name: 'amount',
                        message: 'How much token do you want to transfer?',
                    },
                ]);
                const addresses_transfer = availableAddresses();
                const chooseAddress_transfer = await prompt({
                    type: 'list',
                    name: 'address',
                    message: 'Which address you want to choose:)',
                    choices: addresses_transfer,
                });
                await quoteToken.transfer(
                    chooseAddress_transfer.address,
                    toBN(transferQuery.amount),
                    gasLimitAndGasPrice,
                );
                break;
            case 'Calculate Premium': {
                const policyCoverageQuery = await prompt({
                    type: 'input',
                    name: 'coverage',
                    message: 'How much coverage do you want to buy?',
                });
                const policyDurationQuery = await prompt({
                    type: 'input',
                    name: 'duration',
                    message: 'How long do you want to buy? (in days)',
                });
                const premium = await globalsViewer
                    .connect(currentSigner)
                    .getPremium(
                        toBN(String(policyCoverageQuery.coverage)),
                        String(policyDurationQuery.duration),
                        metaDefender.address,
                    );
                console.log(premium);
                break;
            }
            case 'Query Global Views':
                const globals = await globalsViewer
                    .connect(currentSigner)
                    .getGlobals();
                console.log(globals);
                break;
            case 'Choose Address':
                const signers = await hre.ethers.getSigners();
                const addresses = [];
                for (let i = 0; i < signers.length; i++) {
                    addresses.push(await signers[i].getAddress());
                }
                const chooseAddress = await prompt({
                    type: 'list',
                    name: 'address',
                    message: 'Which address you want to choose:)',
                    choices: addresses,
                });
                currentSigner =
                    signers[addresses.indexOf(chooseAddress.address)];
                break;
            case 'My Address':
                console.log(chalk.green(await currentSigner.getAddress()));
                break;
            case 'Query Insurance Price':
                const policyCoverageQuery = await prompt({
                    type: 'input',
                    name: 'coverage',
                    message: 'How much coverage do you want to buy?',
                });
                const policyDurationQuery = await prompt({
                    type: 'input',
                    name: 'duration',
                    message: 'How long do you want to buy? (in days)',
                });
                if (
                    !isNaN(Number(policyCoverageQuery.coverage)) &&
                    !isNaN(Number(policyDurationQuery.duration))
                ) {
                    const price = await globalsViewer
                        .connect(currentSigner)
                        .getPremium(
                            toBN(String(policyCoverageQuery.coverage)),
                            String(policyDurationQuery.duration),
                            metaDefender.address,
                        );
                    console.log(chalk.green('Price: ' + price));
                }
                break;
            case 'Query My Account':
                const balance = await quoteToken.balanceOf(
                    await currentSigner.getAddress(),
                );
                console.log(
                    'You have the balance of ' +
                        Number(balance) / 1e18 +
                        ' USDTs',
                );
                const certificates =
                    await liquidityCertificate.getLiquidityProviders(
                        await currentSigner.getAddress(),
                    );
                console.log(
                    chalk.green(
                        'Here are your certificates(including expired ones):',
                    ),
                );
                for (let i = 0; i < certificates.length; i++) {
                    console.log(
                        await liquidityCertificate.getCertificateInfo(
                            certificates[i],
                        ),
                    );
                }
                const policies = await policy.getPolicies(
                    await currentSigner.getAddress(),
                );
                console.log(chalk.red('Here are your policies'));
                for (let i = 0; i < policies.length; i++) {
                    console.log(await policy.getPolicyInfo(policies[i]));
                }
                break;
            case 'Give Me Some Test Token':
                const faucet = await quoteToken
                    .connect(currentSigner)
                    .mint(await currentSigner.getAddress(), toBN('10000'));
                console.log(faucet.hash);
                break;
            case 'Approve':
                const approval = await quoteToken
                    .connect(currentSigner)
                    .approve(metaDefender.address, toBN('99999999'));
                console.log(approval.hash);
                break;
            case 'Provide Liquidity':
                const provideLiquidity = await prompt({
                    type: 'input',
                    name: 'amount',
                    message: 'how much USDTs do you want to provide',
                });
                if (isNaN(Number(provideLiquidity))) {
                    await metaDefender
                        .connect(currentSigner)
                        .certificateProviderEntrance(
                            String(toBN(provideLiquidity.amount)),
                            gasLimitAndGasPrice,
                        );
                } else {
                    throw new Error('invalid number');
                }
                break;
            case 'Time Travel':
                console.log('current time is ' + (await currentTime()));
                await fastForward(86400);
                console.log('current time is ' + (await currentTime()));
                break;
            case 'Liquidity Withdraw':
                const csac_withdraw =
                    await getCurrentSignerAvailableCertificates(
                        liquidityCertificate,
                        currentSigner,
                    );
                const withdraw = await prompt({
                    type: 'list',
                    name: 'certificateId',
                    message: 'Which certificate you want to withdraw:)',
                    choices: csac_withdraw,
                });
                await metaDefender
                    .connect(currentSigner)
                    .certificateProviderExit(
                        String(withdraw.certificateId),
                        false,
                        gasLimitAndGasPrice,
                    );
                break;
            case 'Buy Policy':
                const policyCoverage = await prompt({
                    type: 'input',
                    name: 'coverage',
                    message: 'How much coverage do you want to buy?',
                });
                const policyDuration = await prompt({
                    type: 'input',
                    name: 'duration',
                    message: 'How long do you want to buy? (in days)',
                });
                if (
                    !isNaN(Number(policyCoverage.coverage)) &&
                    !isNaN(Number(policyDuration.duration))
                ) {
                    await metaDefender
                        .connect(currentSigner)
                        .buyPolicy(
                            await currentSigner.getAddress(),
                            toBN(String(policyCoverage.coverage)),
                            String(policyDuration.duration),
                            gasLimitAndGasPrice,
                        );
                }
                break;
            case 'Exit':
                process.exit(0);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
